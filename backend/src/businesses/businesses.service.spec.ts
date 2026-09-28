import { BusinessesService } from './businesses.service';

// @nestjs/config ships as ESM, which jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../billing/billing.service', () => ({ BillingService: class {} }));

type Row = Record<string, unknown>;

const BROWSER =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

function setup(opts: { widgets?: Row[]; paid?: boolean } = {}) {
  const widgets = opts.widgets ?? [
    { placeId: 'P1', placeName: 'Cafe', placeAddress: 'Main St', logo: null },
    {
      placeId: 'P1',
      placeName: 'Cafe',
      placeAddress: 'Main St',
      logo: 'data:image/png;base64,AAAA',
    },
    { placeId: 'P2', placeName: 'Bakery', placeAddress: null, logo: null },
  ];
  const businesses: Row[] = [];
  const opens: Row[] = [];
  const prisma = {
    widget: {
      findMany: jest.fn(() => Promise.resolve(widgets)),
      findFirst: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(
          widgets.find((w) => w.placeId === where.placeId && w.logo) ?? null,
        ),
      ),
    },
    business: {
      findMany: jest.fn(() => Promise.resolve([...businesses])),
      create: jest.fn(({ data }: { data: Row }) => {
        const row = {
          id: `b${businesses.length + 1}`,
          posterColor: null,
          ...data,
        };
        businesses.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: { where: Row; data: Row }) =>
        Promise.resolve(
          Object.assign(
            businesses.find((b) => b.id === where.id)!,
            data,
          ),
        ),
      ),
      findUnique: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(businesses.find((b) => b.slug === where.slug) ?? null),
      ),
      findFirst: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(businesses.find((b) => b.id === where.id) ?? null),
      ),
    },
    reviewLinkOpen: {
      upsert: jest.fn(({ create }: { create: Row }) => {
        const had = opens.find(
          (o) => o.businessId === create.businessId && o.day === create.day,
        );
        if (had) had.opens = (had.opens as number) + 1;
        else opens.push({ ...create });
        return Promise.resolve({});
      }),
      groupBy: jest.fn(({ where }: { where: { day?: { gte: string } } }) => {
        const sums = new Map<string, number>();
        for (const o of opens) {
          if (where.day && (o.day as string) < where.day.gte) continue;
          const id = o.businessId as string;
          sums.set(id, (sums.get(id) ?? 0) + (o.opens as number));
        }
        return Promise.resolve(
          [...sums].map(([businessId, n]) => ({
            businessId,
            _sum: { opens: n },
          })),
        );
      }),
    },
  };
  const billing = {
    planFor: jest.fn(() =>
      Promise.resolve({ key: opts.paid === false ? 'FREE' : 'PRO' }),
    ),
  };
  const config = {
    get: jest.fn((k: string) =>
      k === 'SITE_URL' ? 'https://widgetpop.com' : undefined,
    ),
  };
  const service = new BusinessesService(
    prisma as never,
    billing as never,
    config as never,
  );
  return { service, prisma, businesses, opens };
}

describe('businesses for the review tools', () => {
  it('lists each business once, however many widgets show it', async () => {
    const { service } = setup();
    const list = await service.list('u1');
    expect(list.map((b) => b.placeName)).toEqual(['Cafe', 'Bakery']);
    for (const b of list) {
      expect(b.link).toMatch(/^https:\/\/widgetpop\.com\/r\/[a-z2-9]{7}$/);
    }
  });

  it('keeps the same link every time it is listed', async () => {
    const { service, prisma } = setup();
    const first = await service.list('u1');
    const again = await service.list('u1');
    expect(again.map((b) => b.link)).toEqual(first.map((b) => b.link));
    expect(prisma.business.create).toHaveBeenCalledTimes(2);
  });

  it('takes the poster logo a widget of the business had', async () => {
    const { service } = setup();
    const [cafe, bakery] = await service.list('u1');
    expect(cafe.logo).toBe('data:image/png;base64,AAAA');
    expect(bakery.logo).toBeNull();
  });

  it('counts a person opening the link and sends them to Google', async () => {
    const { service, businesses } = setup();
    await service.list('u1');
    const slug = businesses[0].slug as string;
    const url = await service.open(slug, BROWSER);
    expect(url).toBe('https://search.google.com/local/writereview?placeid=P1');
    await service.open(slug, BROWSER);
    const [cafe] = await service.list('u1');
    expect(cafe.opens30).toBe(2);
    expect(cafe.opensTotal).toBe(2);
  });

  it('does not count link previews and bots', async () => {
    const { service, businesses, opens } = setup();
    await service.list('u1');
    const slug = businesses[0].slug as string;
    await service.open(slug, 'WhatsApp/2.23.20.0 A');
    await service.open(slug, 'facebookexternalhit/1.1');
    await service.open(slug, undefined);
    expect(opens).toEqual([]);
  });

  it('knows no link that was never made', async () => {
    const { service } = setup();
    expect(await service.open('nosuch1', BROWSER)).toBeNull();
    expect(await service.open('../etc', BROWSER)).toBeNull();
  });

  it('keeps the review tools for paid plans', async () => {
    const { service } = setup({ paid: false });
    const [cafe] = await service.list('u1');
    await expect(service.setLogo('u1', cafe.id, null)).rejects.toThrow(
      /Pro and Business/,
    );
  });

  it('saves a poster colour, and only a real one', async () => {
    const { service, businesses } = setup();
    const [cafe] = await service.list('u1');
    await service.setPosterColor('u1', cafe.id, '#1d4ed8');
    expect(businesses[0].posterColor).toBe('#1d4ed8');
    await expect(
      service.setPosterColor('u1', cafe.id, 'red; x'),
    ).rejects.toThrow(/colour/);
  });
});
