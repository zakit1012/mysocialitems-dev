/**
 * Widget settings as the API stores them (see backend widget-settings.ts).
 * The editor, the live preview and the embed script all read this one shape.
 */

export type Layout = "grid" | "masonry" | "list" | "quotes" | "showcase" | "carousel";

/** Designs for paid plans. A Free account can try them here, not save them. */
export const PRO_LAYOUTS: Layout[] = ["masonry", "quotes", "showcase"];
export const isProLayout = (layout?: string) => PRO_LAYOUTS.includes(layout as Layout);
export const layoutName = (layout?: string) =>
  layout ? layout.charAt(0).toUpperCase() + layout.slice(1) : "";
export type Sort = "mostRelevant" | "newest";
export type ButtonIcon = "google" | "chat" | "star" | "none";

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
  | "reviewBold";

export type WidgetSettings = {
  theme?: "light" | "dark";
  /** The theme's panel or none; a backgroundColor (custom) wins over both. */
  background?: "theme" | "transparent";
  layout?: Layout;
  gridColumns?: "1" | "2" | "3" | "4";
  sort?: Sort;
  reviewCount?: number;
  radius?: "none" | "md" | "lg";
  textLines?: "3" | "6" | "all";
  headerAlign?: "left" | "center";
  buttonPosition?: "left" | "center" | "right" | "full";
  writeButtonIcon?: ButtonIcon;
  allButtonIcon?: ButtonIcon;
  /** Older widgets: on/off Google logo on "See all reviews", before allButtonIcon. */
  buttonIcon?: boolean;
} & Partial<Record<ColorKey, string>> &
  Partial<Record<ToggleKey, boolean>>;

/** What a brand new widget starts with. Colors are unset = follow the theme. */
export const DEFAULT_SETTINGS: WidgetSettings = {
  theme: "light",
  background: "theme",
  layout: "grid",
  sort: "mostRelevant",
  radius: "md",
  textLines: "6",
  headerAlign: "center",
  buttonPosition: "center",
  writeButtonIcon: "chat",
  allButtonIcon: "google",
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
  autoplay: true,
  cardBorder: true,
  cardShadow: false,
  reviewItalic: false,
  reviewBold: false,
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
      return dark ? "#111827" : "#f9fafb";
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

export type BackgroundMode = "theme" | "transparent" | "custom";

/**
 * What sits behind the reviews, the way widget.js reads it. Widgets saved
 * before this choice existed: light sat on the site, dark in its panel.
 */
export function backgroundMode(s: WidgetSettings): BackgroundMode {
  if (s.backgroundColor) return "custom";
  if (s.background === "theme" || s.background === "transparent") return s.background;
  return s.theme === "dark" ? "theme" : "transparent";
}

/**
 * The paid-plan choices a widget uses (same keys as the API), so a Free
 * account can try them here but not save them.
 */
export function proChoices(s: WidgetSettings): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  if (isProLayout(s.layout)) out.push({ key: `layout:${s.layout}`, label: `the ${layoutName(s.layout)} design` });
  const bg = backgroundMode(s);
  if (bg === "transparent") out.push({ key: "bg:transparent", label: "a transparent background" });
  if (bg === "custom") out.push({ key: `bg:${s.backgroundColor?.toLowerCase()}`, label: "a custom background colour" });
  return out;
}

/** Pro choices in `next` that `saved` did not already have. */
export function newProChoices(next: WidgetSettings, saved?: WidgetSettings): string[] {
  const had = new Set(saved ? proChoices(saved).map((c) => c.key) : []);
  return proChoices(next)
    .filter((c) => !had.has(c.key))
    .map((c) => c.label);
}

/** "X is part of Pro..." for one or more choices, as the API words it. */
export function proMessage(labels: string[]): string {
  const list =
    labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : labels[0];
  const them = labels.length > 1 ? "them" : "it";
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${labels.length > 1 ? "are" : "is"} part of Pro. Upgrade to use ${them}, or switch ${them} off to save.`;
}

export const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "mostRelevant", label: "Most relevant" },
  { value: "newest", label: "Newest first" },
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
  out.background = s.background ?? "";
  out.gridColumns = s.gridColumns ?? "";
  out.reviewCount = s.reviewCount ?? "";
  return out;
}
