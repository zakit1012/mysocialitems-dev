import {
  CampaignSender,
  isServerDown,
  isTemporary,
} from './campaign-sender.service';

// Only needed as injection tokens here; @nestjs/config ships as ESM, which
// jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../mail/mail.service', () => ({ MailService: class {} }));

/**
 * Campaigns go out in the background at the chosen speed. An email is never
 * sent twice, a stopped campaign stops, an unsubscribed address is skipped,
 * and a mail server that is down makes sending wait instead of failing
 * everyone.
 */

type Delivery = {
  id: string;
  campaignId: string;
  email: string;
  name: string | null;
  status: string;
  error?: string | null;
  attempts: number;
  attemptedAt: Date | null;
};

function setup(
  opts: {
    emails?: number;
    perMinute?: number;
    suppressed?: string[];
    fail?: (email: string) => Error | null;
  } = {},
) {
  const campaign = {
    id: 'c1',
    status: 'SENDING',
    lastError: null as string | null,
    finishedAt: null as Date | null,
  };
  const deliveries: Delivery[] = Array.from(
    { length: opts.emails ?? 5 },
    (_, i) => ({
      id: `d${i}`,
      campaignId: 'c1',
      email: `p${i}@example.test`,
      name: null,
      status: 'QUEUED',
      attempts: 0,
      attemptedAt: null,
    }),
  );
  const sent: string[] = [];
  // Enough of Prisma's where: equals, { in }, { lt } on a date, null, OR.
  const match = (d: Delivery, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') {
        return (v as Record<string, unknown>[]).some((w) => match(d, w));
      }
      const value = (d as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && 'in' in v) {
        return (v.in as unknown[]).includes(value);
      }
      if (v && typeof v === 'object' && 'lt' in v) {
        return value instanceof Date && value < (v.lt as Date);
      }
      return value === v;
    });
  // attemptedAt, nulls first, then id - the sender's order.
  const order = (a: Delivery, b: Delivery) =>
    (a.attemptedAt?.getTime() ?? -Infinity) -
      (b.attemptedAt?.getTime() ?? -Infinity) || a.id.localeCompare(b.id);
  const prisma = {
    emailCampaign: {
      findFirst: jest.fn(() =>
        Promise.resolve(campaign.status === 'SENDING' ? campaign : null),
      ),
      findUnique: jest.fn(() => Promise.resolve({ status: campaign.status })),
      update: jest.fn(({ data }: { data: Partial<typeof campaign> }) => {
        Object.assign(campaign, data);
        return Promise.resolve(campaign);
      }),
      updateMany: jest.fn(
        ({ where, data }: { where: { status: string }; data: object }) => {
          if (campaign.status !== where.status) return { count: 0 };
          Object.assign(campaign, data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    emailDelivery: {
      findMany: jest.fn(
        ({ where, take }: { where: Record<string, unknown>; take: number }) =>
          Promise.resolve(
            deliveries
              .filter((d) => match(d, where))
              .sort(order)
              .slice(0, take),
          ),
      ),
      count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(deliveries.filter((d) => match(d, where)).length),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          const d = deliveries.find((x) => x.id === where.id)!;
          Object.assign(d, data);
          return Promise.resolve(d);
        },
      ),
      updateMany: jest.fn(
        ({ where, data }: { where: Record<string, unknown>; data: object }) => {
          const hit = deliveries.filter((d) => match(d, where));
          hit.forEach((d) => Object.assign(d, data));
          return Promise.resolve({ count: hit.length });
        },
      ),
    },
    emailSuppression: {
      findMany: jest.fn(() =>
        Promise.resolve((opts.suppressed ?? []).map((email) => ({ email }))),
      ),
    },
  };
  const campaigns = {
    rate: jest.fn(() => Promise.resolve(opts.perMinute ?? 60)),
    deliver: jest.fn((_c: unknown, d: Delivery) => {
      const err = opts.fail?.(d.email);
      if (err) return Promise.reject(err);
      sent.push(d.email);
      return Promise.resolve(`<m-${d.id}@x>`);
    }),
  };
  const mail = { ready: true };
  const sender = new CampaignSender(
    prisma as never,
    {} as never,
    mail as never,
    campaigns as never,
  );
  return { sender, campaign, deliveries, sent, campaigns, mail };
}

const MINUTE = 60_000;

describe('sending a campaign', () => {
  it('sends at the chosen speed, then marks the campaign sent', async () => {
    const { sender, campaign, deliveries, sent } = setup({
      emails: 5,
      perMinute: 60,
    });
    // Ten seconds at 60 a minute: ten allowed, five to send.
    await sender.run(Date.now() + 10_000);
    expect(sent).toHaveLength(5);
    expect(deliveries.every((d) => d.status === 'SENT')).toBe(true);
    await sender.run(Date.now() + 20_000);
    expect(campaign.status).toBe('SENT');
  });

  it('never sends more than the speed allows', async () => {
    const { sender, sent } = setup({ emails: 50, perMinute: 12 });
    const start = Date.now();
    // Twelve a minute is one every five seconds.
    for (let t = 1; t <= 6; t++) await sender.run(start + t * 5_000);
    expect(sent.length).toBeLessThanOrEqual(7);
    expect(sent.length).toBeGreaterThanOrEqual(5);
    await sender.run(start + MINUTE + 5_000);
    expect(sent.length).toBeLessThanOrEqual(14);
  });

  it('never sends one email twice', async () => {
    const { sender, sent } = setup({ emails: 3, perMinute: 600 });
    await Promise.all([
      sender.run(Date.now() + 10_000),
      sender.run(Date.now() + 10_000),
    ]);
    expect(new Set(sent).size).toBe(sent.length);
  });

  it('skips an address that unsubscribed after it was queued', async () => {
    const { sender, deliveries, sent } = setup({
      emails: 2,
      suppressed: ['p0@example.test'],
    });
    await sender.run(Date.now() + 10_000);
    expect(sent).toEqual(['p1@example.test']);
    expect(deliveries[0]).toMatchObject({
      status: 'SKIPPED',
      error: 'Unsubscribed.',
    });
  });

  it('stops between emails when the campaign is stopped', async () => {
    const { sender, campaign, sent, campaigns } = setup({
      emails: 5,
      perMinute: 600,
    });
    campaigns.deliver.mockImplementationOnce(() => {
      campaign.status = 'STOPPED';
      sent.push('first');
      return Promise.resolve('<m@x>');
    });
    await sender.run(Date.now() + 10_000);
    expect(sent).toEqual(['first']);
  });

  it('records an address the server refused, and carries on', async () => {
    const refused = Object.assign(new Error('550 No such user'), {
      responseCode: 550,
    });
    const { sender, deliveries, sent } = setup({
      emails: 3,
      fail: (email) => (email === 'p1@example.test' ? refused : null),
    });
    await sender.run(Date.now() + 10_000);
    expect(deliveries[1]).toMatchObject({
      status: 'FAILED',
      error: '550 No such user',
    });
    expect(sent).toEqual(['p0@example.test', 'p2@example.test']);
  });

  it('waits when the mail server is down, instead of failing everyone', async () => {
    const down = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNECTION',
    });
    let broken = true;
    const { sender, deliveries, campaign, sent } = setup({
      emails: 3,
      fail: () => (broken ? down : null),
    });
    const start = Date.now();
    await sender.run(start + 10_000);
    expect(deliveries.map((d) => d.status)).toEqual([
      'QUEUED',
      'QUEUED',
      'QUEUED',
    ]);
    expect(campaign.lastError).toMatch(/trying again in a minute/);
    broken = false;
    // Still waiting a few seconds later...
    await sender.run(Date.now() + 5_000);
    expect(sent).toHaveLength(0);
    // ...and sending again after the pause, with the problem cleared.
    await sender.run(Date.now() + 2 * MINUTE);
    expect(sent).toHaveLength(3);
    expect(campaign.lastError).toBeNull();
  });

  it('sends nothing while email is not set up', async () => {
    const { sender, sent, mail } = setup();
    mail.ready = false;
    await sender.run(Date.now() + 10_000);
    expect(sent).toHaveLength(0);
  });
});

describe('an address a server says "try later" about', () => {
  const later = () =>
    Object.assign(new Error('421 Try again later'), {
      code: 'EENVELOPE',
      responseCode: 421,
    });

  it('waits behind the others, who are still sent', async () => {
    const { sender, deliveries, sent, campaign } = setup({
      emails: 5,
      fail: (email) => (email === 'p0@example.test' ? later() : null),
    });
    const start = Date.now();
    await sender.run(start + 10_000);
    expect(deliveries[0]).toMatchObject({ status: 'QUEUED', attempts: 1 });
    expect(campaign.lastError).toMatch(/p0@example.test/);
    // After the short pause the rest go out, p0 still waiting its turn.
    await sender.run(start + 10_000 + 2 * MINUTE);
    expect(sent).toEqual([
      'p1@example.test',
      'p2@example.test',
      'p3@example.test',
      'p4@example.test',
    ]);
    expect(campaign.status).toBe('SENDING');
  });

  it('fails it after five tries, and then the campaign is done', async () => {
    const { sender, deliveries, campaign } = setup({
      emails: 2,
      fail: (email) => (email === 'p0@example.test' ? later() : null),
    });
    const start = Date.now();
    for (let i = 1; i <= 8; i++) await sender.run(start + i * 6 * MINUTE);
    expect(deliveries[0]).toMatchObject({ status: 'FAILED', attempts: 5 });
    expect(deliveries[0].error).toMatch(/^Refused 5 times/);
    expect(deliveries[1].status).toBe('SENT');
    expect(campaign.status).toBe('SENT');
  });

  it('does not count tries while our own server is down', async () => {
    const down = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNECTION',
    });
    const { sender, deliveries } = setup({ emails: 1, fail: () => down });
    const start = Date.now();
    for (let i = 1; i <= 8; i++) await sender.run(start + i * 6 * MINUTE);
    expect(deliveries[0]).toMatchObject({ status: 'QUEUED', attempts: 0 });
  });
});

describe('which mail server errors are worth a retry', () => {
  it('retries a server that cannot be reached, refuses our login or says later', () => {
    expect(
      isTemporary(Object.assign(new Error('x'), { code: 'ECONNECTION' })),
    ).toBe(true);
    expect(isTemporary(Object.assign(new Error('x'), { code: 'EAUTH' }))).toBe(
      true,
    );
    expect(
      isTemporary(Object.assign(new Error('x'), { responseCode: 421 })),
    ).toBe(true);
    expect(
      isTemporary(Object.assign(new Error('x'), { responseCode: 451 })),
    ).toBe(true);
  });

  it('does not retry an address the server refused for good', () => {
    expect(
      isTemporary(Object.assign(new Error('x'), { responseCode: 550 })),
    ).toBe(false);
    expect(
      isTemporary(Object.assign(new Error('x'), { code: 'EENVELOPE' })),
    ).toBe(false);
  });

  it('tells our server being down from one address being refused', () => {
    expect(
      isServerDown(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })),
    ).toBe(true);
    expect(isServerDown(new Error('SMTP is not set up.'))).toBe(true);
    expect(
      isServerDown(
        Object.assign(new Error('x'), { code: 'EENVELOPE', responseCode: 421 }),
      ),
    ).toBe(false);
  });
});
