import type { EngineReview } from '../reviews-engine/reviews-engine.service';
import {
  HIGHEST_RATED,
  addReviews,
  applyFilters,
  inOrder,
  pickReviews,
  reviewAgeMs,
  widgetOrder,
} from './review-picker';
import { normalizeSettings, proChoices } from './widget-settings';

function review(
  author: string,
  rating = 5,
  extra: Partial<EngineReview> = {},
): EngineReview {
  return {
    review_id: `id-${author}`,
    author,
    author_photo: null,
    rating,
    text: `A lovely visit, says ${author}.`,
    published_at_text: '2 weeks ago',
    images: [],
    ...extra,
  };
}

const keep = (list: EngineReview[]) => Promise.resolve(list);

describe('widgetOrder', () => {
  it('shows Free widgets the highest-rated reviews, whatever was saved', () => {
    expect(widgetOrder(false, { sort: 'newest' }, 'newest')).toBe(
      HIGHEST_RATED,
    );
  });

  it("uses a paid widget's snippet order, then its own, then Most relevant", () => {
    expect(widgetOrder(true, { sort: 'newest' }, 'mostRelevant')).toBe(
      'mostRelevant',
    );
    expect(widgetOrder(true, { sort: 'newest' }, 'lowestRanking')).toBe(
      'newest',
    );
    expect(widgetOrder(true, {})).toBe('mostRelevant');
  });
});

describe('applyFilters', () => {
  const list = [
    review('Asha', 5, { text: 'Great badminton courts.' }),
    review('Ravi', 5, { text: 'Bad parking, great food.' }),
    review('Competitor Owner'),
    review('Meena', 5, {
      text: 'Paneer was fresh',
      images: ['https://x/1.jpg'],
    }),
    review('Kiran', 5, { text: 'खाना गंदा था' }),
  ];
  const names = (l: EngineReview[]) => l.map((r) => r.author);

  it('hides whole words and names only', () => {
    const out = applyFilters(
      list,
      { excludeWords: 'bad, competitor owner, गंदा' },
      true,
    );
    expect(names(out)).toEqual(['Asha', 'Meena']);
  });

  it('shows only reviews with a chosen word, or with photos', () => {
    expect(names(applyFilters(list, { includeWords: 'paneer' }, true))).toEqual(
      ['Meena'],
    );
    expect(names(applyFilters(list, { photosOnly: true }, true))).toEqual([
      'Meena',
    ]);
  });

  it('ignores filters on a Free plan', () => {
    expect(applyFilters(list, { photosOnly: true }, false)).toHaveLength(5);
  });
});

describe('reviewAgeMs', () => {
  const now = Date.parse('2026-09-28T00:00:00Z');
  const day = 86_400_000;

  it('reads Apify dates and the scraper\'s "3 weeks ago"', () => {
    const at = (extra: Partial<EngineReview>) =>
      reviewAgeMs(review('x', 5, extra), now);
    expect(at({ published_at: '2026-09-27T00:00:00Z' })).toBe(day);
    expect(at({ published_at_text: 'a day ago' })).toBe(day);
    expect(at({ published_at_text: '3 weeks ago' })).toBe(21 * day);
    expect(at({ published_at_text: 'Edited 2 years ago' })).toBe(730 * day);
    expect(at({ published_at_text: null })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('inOrder', () => {
  it('puts the newest first for Newest', () => {
    const out = inOrder(
      [
        review('old', 5, { published_at_text: 'a year ago' }),
        review('new', 5, { published_at_text: '2 days ago' }),
        review('mid', 5, { published_at_text: 'a month ago' }),
      ],
      'newest',
    );
    expect(out.map((r) => r.author)).toEqual(['new', 'mid', 'old']);
  });

  it('puts photos, longer stories and likes first for Most relevant', () => {
    const out = inOrder(
      [
        review('short', 5, { text: 'Nice' }),
        review('photo', 5, { images: ['https://x/1.jpg'], likes: 6 }),
      ],
      'mostRelevant',
    );
    expect(out[0].author).toBe('photo');
  });
});

describe('pickReviews', () => {
  // 20 "most relevant" reviews with only 4 five-star, like Pappa Ji Dhaba.
  const relevant = Array.from({ length: 20 }, (_, i) =>
    review(`R${i}`, i % 5 === 0 ? 5 : 4),
  );
  const highest = [
    review('R0'), // also in the relevant list
    ...Array.from({ length: 19 }, (_, i) =>
      review(`H${i}`, 5, { published_at_text: `${i + 1} days ago` }),
    ),
  ];

  it("tops a paid widget up to its allowance from the highest-rated list, in the owner's order", async () => {
    const highestRated = jest.fn(() => Promise.resolve(highest));
    const out = await pickReviews({
      reviews: relevant,
      order: 'newest',
      paid: true,
      settings: {},
      want: 10,
      hide: keep,
      highestRated,
    });
    expect(out.map((r) => r.author)).toEqual([
      'R0',
      'R5',
      'R10',
      'R15',
      'H0',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
    ]);
    expect(highestRated).toHaveBeenCalledTimes(1);
  });

  it('does not fetch the fill-up list when the own order has enough', async () => {
    const highestRated = jest.fn(() => Promise.resolve(highest));
    const out = await pickReviews({
      reviews: relevant,
      order: 'mostRelevant',
      paid: true,
      settings: {},
      want: 3,
      hide: keep,
      highestRated,
    });
    expect(out).toHaveLength(3);
    expect(highestRated).not.toHaveBeenCalled();
  });

  it('never tops up a Free widget', async () => {
    const highestRated = jest.fn(() => Promise.resolve(highest));
    const out = await pickReviews({
      reviews: relevant,
      order: HIGHEST_RATED,
      paid: false,
      settings: {},
      want: 10,
      hide: keep,
      highestRated,
    });
    expect(out).toHaveLength(4);
    expect(highestRated).not.toHaveBeenCalled();
  });

  it('keeps hidden reviews out of the fill-up too', async () => {
    const out = await pickReviews({
      reviews: [],
      order: 'newest',
      paid: true,
      settings: {},
      want: 5,
      hide: (list) => keep(list.filter((r) => r.author !== 'H0')),
      highestRated: () => Promise.resolve(highest),
    });
    expect(out.map((r) => r.author)).not.toContain('H0');
  });
});

describe('addReviews', () => {
  it('adds only reviews not already there', () => {
    const out = addReviews([review('A')], [review('A'), review('B')]);
    expect(out.map((r) => r.author)).toEqual(['A', 'B']);
  });
});

describe('widget settings for filters', () => {
  it('stores filter words cleaned up', () => {
    const s = normalizeSettings({
      excludeWords: ' bad ,,  rude\u0000 staff ',
      includeWords: '',
      photosOnly: true,
    });
    expect(s).toMatchObject({
      excludeWords: 'bad, rude staff',
      photosOnly: true,
    });
    expect(s.includeWords).toBeUndefined();
  });

  it('counts orders, filters and extra reviews as Pro choices on Free', () => {
    const labels = proChoices(
      {
        background: 'theme',
        sort: 'newest',
        reviewCount: 10,
        photosOnly: true,
        excludeWords: 'bad',
      },
      3,
    ).map((c) => c.label);
    expect(labels).toEqual([
      'the Newest order',
      'showing 10 reviews',
      'showing only reviews with photos',
      'hiding reviews by word or name',
    ]);
    expect(proChoices({ background: 'theme', reviewCount: 3 }, 3)).toEqual([]);
  });
});
