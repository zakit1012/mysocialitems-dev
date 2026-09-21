/**
 * Widget settings as the API stores them (see backend widget-settings.ts).
 * The editor, the live preview and the embed script all read this one shape.
 */

export type Layout = "grid" | "masonry" | "list" | "carousel" | "compact";
export type Sort = "mostRelevant" | "newest" | "highestRanking" | "lowestRanking";

export type ColorKey =
  | "backgroundColor"
  | "cardBgColor"
  | "headerTextColor"
  | "authorNameColor"
  | "dateColor"
  | "reviewTextColor"
  | "starColor"
  | "buttonBgColor"
  | "buttonTextColor";

export type ToggleKey =
  | "showBusinessName"
  | "showOverallRating"
  | "showWriteReviewBtn"
  | "showReviews"
  | "showReviewerPhoto"
  | "showReviewDate"
  | "showReviewPhotos"
  | "showAllReviewsBtn"
  | "showGoogleIcon"
  | "showHeaderGoogle"
  | "showOwnerResponse"
  | "readMore"
  | "autoplay"
  | "cardBorder"
  | "cardShadow"
  | "reviewItalic"
  | "reviewBold"
  | "buttonIcon";

export type WidgetSettings = {
  theme?: "light" | "dark";
  layout?: Layout;
  gridColumns?: "1" | "2" | "3" | "4";
  sort?: Sort;
  minRating?: "0" | "3" | "4" | "5";
  reviewCount?: number;
  radius?: "none" | "md" | "lg";
  textLines?: "3" | "6" | "all";
  buttonPosition?: "left" | "center" | "right" | "full";
} & Partial<Record<ColorKey, string>> &
  Partial<Record<ToggleKey, boolean>>;

/** What a brand new widget starts with. Colors are unset = follow the theme. */
export const DEFAULT_SETTINGS: WidgetSettings = {
  theme: "light",
  layout: "grid",
  sort: "mostRelevant",
  minRating: "0",
  radius: "md",
  textLines: "6",
  buttonPosition: "center",
  showBusinessName: true,
  showOverallRating: true,
  showWriteReviewBtn: true,
  showReviews: true,
  showReviewerPhoto: true,
  showReviewDate: true,
  showReviewPhotos: true,
  showAllReviewsBtn: false,
  showGoogleIcon: true,
  showHeaderGoogle: true,
  showOwnerResponse: true,
  readMore: true,
  autoplay: false,
  cardBorder: true,
  cardShadow: false,
  reviewItalic: false,
  reviewBold: false,
  buttonIcon: true,
};

/** Toggles the embed treats as "on" unless explicitly switched off. */
const ON_BY_DEFAULT: ToggleKey[] = [
  "showBusinessName",
  "showOverallRating",
  "showWriteReviewBtn",
  "showReviews",
  "showReviewerPhoto",
  "showReviewDate",
  "showReviewPhotos",
  "showGoogleIcon",
  "showHeaderGoogle",
  "showOwnerResponse",
  "readMore",
  "cardBorder",
];

/** Reads a toggle the same way the embed script does. */
export function isOn(s: WidgetSettings, key: ToggleKey): boolean {
  if (key === "showAllReviewsBtn") {
    // Older widgets never set it and showed the link only without the header button.
    return s.showAllReviewsBtn ?? s.showWriteReviewBtn === false;
  }
  return ON_BY_DEFAULT.includes(key) ? s[key] !== false : s[key] === true;
}

export const COLOR_FIELDS: { key: ColorKey; label: string; group: string }[] = [
  { key: "backgroundColor", label: "Background", group: "Widget" },
  { key: "cardBgColor", label: "Review cards", group: "Widget" },
  { key: "headerTextColor", label: "Business name & rating", group: "Text" },
  { key: "authorNameColor", label: "Reviewer name", group: "Text" },
  { key: "dateColor", label: "Date", group: "Text" },
  { key: "reviewTextColor", label: "Review text", group: "Text" },
  { key: "starColor", label: "Stars", group: "Accents" },
  { key: "buttonBgColor", label: "Buttons", group: "Accents" },
  { key: "buttonTextColor", label: "Button text", group: "Accents" },
];

/** What "Auto" resolves to, mirroring the CSS defaults in widget.js. */
export function themeColor(key: ColorKey, theme: "light" | "dark" = "light"): string {
  const dark = theme === "dark";
  switch (key) {
    case "backgroundColor":
      return dark ? "#111827" : "transparent";
    case "cardBgColor":
      return dark ? "#1f2937" : "#ffffff";
    case "headerTextColor":
    case "authorNameColor":
      return dark ? "#f9fafb" : "#111827";
    case "dateColor":
      return dark ? "#9ca3af" : "#6b7280";
    case "reviewTextColor":
      return dark ? "#d1d5db" : "#374151";
    case "starColor":
      return "#f59e0b";
    case "buttonBgColor":
      return "#f43f5e";
    case "buttonTextColor":
      return "#ffffff";
  }
}

export const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "mostRelevant", label: "Most relevant" },
  { value: "newest", label: "Newest first" },
  { value: "highestRanking", label: "Highest rated" },
  { value: "lowestRanking", label: "Lowest rated" },
];

export const writeReviewUrl = (placeId: string) =>
  `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

/**
 * The body for a save. Unset colors and choices go as "" so the server
 * clears them instead of keeping an old value.
 */
export function toPayload(s: WidgetSettings): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  for (const f of COLOR_FIELDS) out[f.key] = s[f.key] ?? "";
  out.gridColumns = s.gridColumns ?? "";
  out.reviewCount = s.reviewCount ?? "";
  return out;
}
