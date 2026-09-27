import { EngineSyncService } from './engine-sync.service';

// Only needed as injection tokens here; @nestjs/config ships as ESM, which
// jest's CommonJS runtime cannot load.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../mail/mail.service', () => ({ MailService: class {} }));

const FREE = { key: 'FREE', refreshHours: 72 };
const PRO = { key: 'PRO', refreshHours: 24 };

function service(
  widgets: { id: string; placeId: string; userId: string; settings: object }[],
  plans: Record<string, { key: string; refreshHours: number }>,
) {
  const prisma = {
    source: { findMany: jest.fn(() => Promise.resolve([])) },
    widget: {
      findMany: jest.fn(() =>
        Promise.resolve(
          widgets.map((w) => ({ ...w, createdAt: new Date(), stats: [] })),
        ),
      ),
    },
  };
  const billing = {
    coverage: jest.fn((userId: string) =>
      Promise.resolve({
        plan: plans[userId],
        widgets: new Set(widgets.map((w) => w.id)),
      }),
    ),
  };
  return new EngineSyncService(
    {} as never,
    prisma as never,
    {} as never,
    billing as never,
  );
}

const asObject = (plans: Map<string, Map<string, object>>) =>
  Object.fromEntries(
    [...plans].map(([place, sorts]) => [place, Object.fromEntries(sorts)]),
  );

describe('EngineSyncService.placePlans', () => {
  it('asks for the highest-rated 10 every 72 hours on Free', async () => {
    const plans = await service(
      [
        {
          id: 'w1',
          placeId: 'P1',
          userId: 'free',
          settings: { sort: 'newest' },
        },
      ],
      { free: FREE },
    ).placePlans();
    expect(asObject(plans)).toEqual({
      P1: { highestRanking: { hours: 72, count: 10 } },
    });
  });

  it("asks for a paid widget's own order daily and the highest-rated 50 every 15 days", async () => {
    const plans = await service(
      [
        {
          id: 'w1',
          placeId: 'P1',
          userId: 'pro',
          settings: { sort: 'newest' },
        },
      ],
      { pro: PRO },
    ).placePlans();
    expect(asObject(plans)).toEqual({
      P1: {
        newest: { hours: 24, count: 50 },
        highestRanking: { hours: 360, count: 50 },
      },
    });
  });

  it('shares a place between plans: fastest cadence, largest count', async () => {
    const plans = await service(
      [
        {
          id: 'w1',
          placeId: 'P1',
          userId: 'pro',
          settings: { sort: 'mostRelevant' },
        },
        { id: 'w2', placeId: 'P1', userId: 'free', settings: {} },
      ],
      { pro: PRO, free: FREE },
    ).placePlans();
    expect(asObject(plans)).toEqual({
      P1: {
        mostRelevant: { hours: 24, count: 50 },
        highestRanking: { hours: 72, count: 50 },
      },
    });
  });
});
