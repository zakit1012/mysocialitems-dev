/**
 * One shape for widget settings.
 *
 * Earlier screens saved the same thing under different names (headerColor vs
 * headerTextColor, swatch ids like "amber" vs hex). Everything goes through
 * normalizeSettings on the way in and on the way out, so old rows keep working
 * and the embed script only has to know one format.
 *
 * Colors end up inside a style attribute on other people's websites, so only
 * plain hex colors are kept.
 */

export const LAYOUTS = [
  'grid',
  'masonry',
  'list',
  'quotes',
  'showcase',
  'carousel',
];
export const SORTS = ['mostRelevant', 'newest', 'highestRanking'];
const COLUMNS = ['1', '2', '3', '4'];
const BUTTON_POSITIONS = ['left', 'center', 'right', 'full'];
const BUTTON_ICONS = ['google', 'chat', 'star', 'none'];
const RADII = ['none', 'md', 'lg'];
const TEXT_LINES = ['3', '6', 'all'];
const HEADER_ALIGNS = ['left', 'center'];
/** The review engine serves at most this many per call. */
export const MAX_REVIEW_COUNT = 50;

const COLOR_KEYS = [
  'backgroundColor',
  'headerTextColor',
  'reviewTextColor',
  'starColor',
  'cardBgColor',
  'authorNameColor',
  'dateColor',
  'buttonBgColor',
  'buttonTextColor',
] as const;

const BOOL_KEYS = [
  'showBusinessName',
  'showOverallRating',
  'showWriteReviewBtn',
  'showReviews',
  'showReviewerPhoto',
  'showReviewDate',
  'showReviewPhotos',
  'showAllReviewsBtn',
  'showGoogleIcon',
  'showHeaderGoogle',
  'showOwnerResponse',
  'readMore',
  'autoplay',
  'cardBorder',
  'cardShadow',
  'reviewItalic',
  'reviewBold',
  // Older widgets: on/off Google logo on "See all reviews", before allButtonIcon.
  'buttonIcon',
] as const;

/** Old names from earlier screens -> the name everything uses now. */
const RENAMED: Record<string, string> = {
  headerColor: 'headerTextColor',
  showWriteReview: 'showWriteReviewBtn',
};

/** The swatch ids the first builder stored instead of colors. */
const SWATCHES: Record<string, string> = {
  amber: '#f59e0b',
  brand: '#e8446d',
  emerald: '#10b981',
  indigo: '#6366f1',
  coral: '#f43f5e',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  slate: '#475569',
  white: '#ffffff',
  dark: '#1e293b',
};

export type WidgetSettings = {
  theme?: 'light' | 'dark';
  layout?: string;
  gridColumns?: string;
  buttonPosition?: string;
  sort?: string;
  reviewCount?: number;
  writeButtonIcon?: string;
  allButtonIcon?: string;
  radius?: string;
  textLines?: string;
  headerAlign?: string;
} & Partial<Record<(typeof COLOR_KEYS)[number], string>> &
  Partial<Record<(typeof BOOL_KEYS)[number], boolean>>;

function color(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (SWATCHES[v]) return SWATCHES[v];
  return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)
    ? v
    : undefined;
}

function oneOf(value: unknown, allowed: string[]): string | undefined {
  const v = typeof value === 'number' ? String(value) : value;
  return typeof v === 'string' && allowed.includes(v) ? v : undefined;
}

export function normalizeSettings(raw: unknown): WidgetSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const name = RENAMED[k] ?? k;
    // When both spellings exist the current name wins.
    if (name !== k && name in raw) continue;
    input[name] = v;
  }
  // Older widgets used a cramped grid; it renders as the layout that
  // replaced it.
  if (input.layout === 'compact') input.layout = 'quotes';

  const out: WidgetSettings = {};
  if (input.theme === 'light' || input.theme === 'dark') {
    out.theme = input.theme;
  }
  const picks: [keyof WidgetSettings, string[]][] = [
    ['layout', LAYOUTS],
    ['gridColumns', COLUMNS],
    ['buttonPosition', BUTTON_POSITIONS],
    ['sort', SORTS],
    ['writeButtonIcon', BUTTON_ICONS],
    ['allButtonIcon', BUTTON_ICONS],
    ['radius', RADII],
    ['textLines', TEXT_LINES],
    ['headerAlign', HEADER_ALIGNS],
  ];
  for (const [key, allowed] of picks) {
    const v = oneOf(input[key], allowed);
    if (v) (out as Record<string, unknown>)[key] = v;
  }

  const count = Number(input.reviewCount);
  if (Number.isInteger(count) && count >= 1 && count <= MAX_REVIEW_COUNT) {
    out.reviewCount = count;
  }

  for (const key of COLOR_KEYS) {
    const c = color(input[key]);
    if (c) out[key] = c;
  }
  for (const key of BOOL_KEYS) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  return out;
}

/**
 * A save only carries the fields that screen knows about. Merging keeps the
 * rest; an empty string or null clears that one field back to its default.
 */
export function mergeSettings(
  existing: unknown,
  incoming: unknown,
): WidgetSettings {
  const merged: Record<string, unknown> = { ...normalizeSettings(existing) };
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      const name = RENAMED[k] ?? k;
      if (v === '' || v === null) delete merged[name];
    }
  }
  return { ...merged, ...normalizeSettings(incoming) };
}

/**
 * Widgets show 5-star reviews only. This used to be a per-widget
 * "minimum rating" setting; an old minRating on a saved widget is ignored.
 */
export function fiveStarOnly<T extends { rating: number | null }>(
  reviews: T[],
): T[] {
  return reviews.filter((r) => (r.rating ?? 0) >= 5);
}
