import { AnalyticsService, statDay } from './analytics.service';

// Only needed as injection tokens here; @nestjs/config ships as ESM, which
// jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../mail/mail.service', () => ({ MailService: class {} }));

/**
 * The analytics page: the chosen days, the same number of days before them
 * for comparison, and review link opens per business - the page shows the
 * opens here, not on Get reviews.
 */

const daysAgo = (n: number) => statDay(new Date(Date.now() - n * 86_400_000));
const stat = (day: string, views: number, clicks = 0) => ({
  widgetId: 'w1',
  day,
  views,
  loads: views,
  clicks,
  missed: 0,
});

function setup() {
  const prisma = {
    usage: { findUnique: jest.fn(() => Promise.resolve({ views: 40 })) },
    widget: {
      findMany: jest.fn(() =>
        Promise.resolve([{ id: 'w1', placeName: 'Bella Vista Café' }]),
      ),
    },
    widgetStat: {
      findMany: jest.fn(() =>
        Promise.resolve([
          stat(daysAgo(0), 10, 2),
          stat(daysAgo(6), 5, 1),
          // The 7 days before: compared against, not counted.
          stat(daysAgo(7), 3),
          stat(daysAgo(13), 4),
        ]),
      ),
    },
    source: { findMany: jest.fn(() => Promise.resolve([])) },
    business: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { id: 'b1', placeName: 'Bella Vista Café' },
          { id: 'b2', placeName: 'Riverside' },
        ]),
      ),
    },
    reviewLinkOpen: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { businessId: 'b1', day: daysAgo(1), opens: 4 },
          { businessId: 'b1', day: daysAgo(2), opens: 1 },
          { businessId: 'b1', day: daysAgo(9), opens: 2 },
        ]),
      ),
      groupBy: jest.fn(() =>
        Promise.resolve([{ businessId: 'b1', _sum: { opens: 30 } }]),
      ),
    },
  };
  const billing = {
    planFor: jest.fn(() => Promise.resolve({ name: 'Pro', views: 1e9 })),
  };
  return new AnalyticsService(prisma as never, billing as never);
}

describe('the analytics overview', () => {
  it('counts the chosen days, and the days before them apart', async () => {
    const r = await setup().overview('u1', 7);
    expect(r.totals).toMatchObject({ views: 15, clicks: 3, opens: 5 });
    expect(r.previous).toMatchObject({ views: 7, clicks: 0, opens: 2 });
    expect(r.daily).toHaveLength(7);
    expect(r.daily.at(-1)).toMatchObject({ day: daysAgo(0), views: 10 });
    expect(r.daily.find((d) => d.day === daysAgo(1))?.opens).toBe(4);
  });

  it('lists every review link, with its opens in range and ever', async () => {
    const r = await setup().overview('u1', 7);
    expect(r.reviewLinks).toEqual([
      { id: 'b1', name: 'Bella Vista Café', opens: 5, total: 30 },
      { id: 'b2', name: 'Riverside', opens: 0, total: 0 },
    ]);
  });
});
