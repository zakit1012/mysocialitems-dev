/**
 * Which reviews a widget shows, the same way in the embed, the editor
 * preview and the new-widget preview.
 *
 * Free widgets show a place's highest-rated reviews. Paid widgets show the
 * owner's order (Newest or Most relevant) with their filters; when those
 * leave fewer 5-star reviews than the widget may show, the place's
 * highest-rated reviews fill the rest - ordered the way the owner's own
 * order would put them.
 */
import type { EngineReview } from '../reviews-engine/reviews-engine.service';
import { SORTS, type WidgetSettings, fiveStarOnly } from './widget-settings';

/** The order Free widgets use, and the one paid widgets are topped up from. */
export const HIGHEST_RATED = 'highestRanking';

/**
 * How many reviews a Free owner sees in the dashboard previews - what an
 * upgrade would add. Their website shows the plan's own number.
 */
export const FREE_PREVIEW_REVIEWS = 10;

/** The order a widget's reviews come in. `asked` is a snippet's data-sort. */
export function widgetOrder(
  paid: boolean,
  settings: WidgetSettings,
  asked?: string,
): string {
  if (!paid) return HIGHEST_RATED;
  if (asked && SORTS.includes(asked)) return asked;
  return settings.sort || 'mostRelevant';
}

/** Comma list -> lowercased words, as typed in the editor. */
function wordList(list: string | undefined): string[] {
  return (list ?? '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whole words only: "bad" must not hide a review about badminton. Letters
 * and digits of any script count as part of a word.
 */
function mentions(text: string, word: string): boolean {
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRe(word)}($|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(text);
}

/** The owner's filters. Paid only: a downgraded widget shows everything again. */
export function applyFilters<T extends EngineReview>(
  reviews: T[],
  settings: WidgetSettings,
  paid: boolean,
): T[] {
  if (!paid) return reviews;
  const exclude = wordList(settings.excludeWords);
  const include = wordList(settings.includeWords);
  return reviews.filter((r) => {
    const text = r.text || '';
    const author = r.author || '';
    if (exclude.some((w) => mentions(text, w) || mentions(author, w))) {
      return false;
    }
    if (include.length && !include.some((w) => mentions(text, w))) {
      return false;
    }
    if (settings.photosOnly && !(r.images && r.images.length)) return false;
    return true;
  });
}

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

/**
 * Roughly how long ago a review was written: Apify's date when there is
 * one, else the scraper's "3 weeks ago". Unknown sorts last.
 */
export function reviewAgeMs(r: EngineReview, now = Date.now()): number {
  if (r.published_at) {
    const at = Date.parse(r.published_at);
    if (!Number.isNaN(at)) return Math.max(0, now - at);
  }
  const text = (r.published_at_text || '').toLowerCase();
  if (/just now|moments? ago/.test(text)) return 0;
  const m = text.match(
    /\b(a|an|\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/,
  );
  if (!m) return Number.POSITIVE_INFINITY;
  const n = m[1] === 'a' || m[1] === 'an' ? 1 : Number(m[1]);
  return n * UNIT_MS[m[2]];
}

/**
 * Google does not publish how it ranks "Most relevant"; photos, a written
 * story and other people's likes are what lift a review there.
 */
export function relevance(r: EngineReview): number {
  const photos = r.images && r.images.length ? 2 : 0;
  const length = Math.min((r.text || '').length / 200, 2);
  const likes = Math.min((r.likes ?? 0) / 5, 2);
  return photos + length + likes;
}

/** Fill-up reviews in the owner's order: newest first, or most "relevant" first. */
export function inOrder<T extends EngineReview>(
  reviews: T[],
  order: string,
): T[] {
  if (order === 'newest') {
    return [...reviews].sort((a, b) => reviewAgeMs(a) - reviewAgeMs(b));
  }
  if (order === 'mostRelevant') {
    return [...reviews].sort((a, b) => relevance(b) - relevance(a));
  }
  return reviews;
}

/** One review in two lists of the same place: its id, else its author and text. */
const reviewKey = (r: EngineReview) =>
  r.review_id ||
  `${(r.author ?? '').trim().toLowerCase()}|${(r.text || '').trim().slice(0, 80).toLowerCase()}`;

/** `first`, then the reviews of `more` it does not already have. */
export function addReviews<T extends EngineReview>(first: T[], more: T[]): T[] {
  const seen = new Set(first.map(reviewKey));
  const added = more.filter((r) => {
    const key = reviewKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...first, ...added];
}

/**
 * The reviews a widget shows. `hide` removes reviews a reviewer asked us to
 * stop showing; `highestRated` fetches the place's highest-rated list and is
 * only called when the widget's own order falls short.
 */
export async function pickReviews(input: {
  reviews: EngineReview[];
  order: string;
  paid: boolean;
  settings: WidgetSettings;
  want: number;
  hide: (reviews: EngineReview[]) => Promise<EngineReview[]>;
  highestRated: () => Promise<EngineReview[]>;
}): Promise<EngineReview[]> {
  const { order, paid, settings, want } = input;
  const usable = async (list: EngineReview[]) =>
    applyFilters(await input.hide(fiveStarOnly(list)), settings, paid);

  let shown = await usable(input.reviews);
  if (paid && order !== HIGHEST_RATED && shown.length < want) {
    const more = await usable(await input.highestRated());
    shown = addReviews(shown, inOrder(more, order));
  }
  return shown.slice(0, want);
}
