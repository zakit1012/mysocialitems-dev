"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Check,
  Eye,
  LayoutGrid,
  MessageSquare,
  Minus,
  Moon,
  Paintbrush,
  Palette,
  Pipette,
  Plus,
  RotateCcw,
  Star,
  Sun,
} from "lucide-react";
import {
  COLOR_FIELDS,
  SORT_OPTIONS,
  backgroundMode,
  isOn,
  isProLayout,
  layoutName,
  themeColor,
  type BackgroundMode,
  type ButtonIcon,
  type ColorKey,
  type Layout,
  type ToggleKey,
  type WidgetSettings,
} from "@/lib/widget-settings";

const TABS = [
  { id: "layout", label: "Layout", icon: LayoutGrid },
  { id: "content", label: "Content", icon: Eye },
  { id: "colors", label: "Colors", icon: Palette },
  { id: "style", label: "Style", icon: Paintbrush },
] as const;
type TabId = (typeof TABS)[number]["id"];

const SWATCHES = ["#e8446d", "#f43f5e", "#f59e0b", "#10b981", "#0ea5e9", "#6366f1", "#1e293b", "#ffffff"];

/** Small drawings of each layout, so the choice is visual. */
function LayoutSketch({ id }: { id: Layout }) {
  const box = "rounded-[3px] bg-current";
  switch (id) {
    case "grid":
      return (
        <div className="grid h-9 w-12 grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((i) => <span key={i} className={box} />)}
        </div>
      );
    case "masonry":
      return (
        <div className="flex h-9 w-12 gap-1">
          <div className="flex flex-1 flex-col gap-1"><span className={`${box} h-5`} /><span className={`${box} flex-1`} /></div>
          <div className="flex flex-1 flex-col gap-1"><span className={`${box} h-3`} /><span className={`${box} flex-1`} /></div>
        </div>
      );
    case "list":
      return (
        <div className="flex h-9 w-12 flex-col gap-1">
          {[0, 1, 2].map((i) => <span key={i} className={`${box} flex-1`} />)}
        </div>
      );
    case "quotes":
      return (
        <div className="flex h-9 w-12 flex-col justify-center gap-1 px-0.5">
          <span className="font-serif text-sm leading-none">“</span>
          <span className={`${box} h-1.5 w-full`} />
          <span className={`${box} h-1.5 w-2/3`} />
        </div>
      );
    case "showcase":
      return (
        <div className="flex h-9 w-12 items-stretch gap-1">
          {[0, 1, 2].map((i) => <span key={i} className={`${box} flex-1`} />)}
        </div>
      );
    case "carousel":
      return (
        <div className="flex h-9 w-12 items-center gap-0.5">
          <span className="text-[10px] leading-none">‹</span>
          <span className={`${box} h-full flex-1`} />
          <span className={`${box} h-full flex-1 opacity-60`} />
          <span className="text-[10px] leading-none">›</span>
        </div>
      );
  }
}

const LAYOUTS: { id: Layout; label: string; hint: string }[] = [
  { id: "grid", label: "Grid", hint: "Cards in rows" },
  { id: "masonry", label: "Masonry", hint: "Pinterest style" },
  { id: "list", label: "List", hint: "One per row" },
  { id: "quotes", label: "Quotes", hint: "Big testimonial text" },
  { id: "showcase", label: "Showcase", hint: "One big review, the rest around it" },
  { id: "carousel", label: "Carousel", hint: "Slides sideways with arrows" },
];

export function WidgetEditor({
  value,
  onChange,
  maxReviews,
  saveReviews,
  planName,
  footer,
  canUsePro = true,
}: {
  value: WidgetSettings;
  onChange: (next: WidgetSettings) => void;
  /** How many reviews the preview may show: the plan's, or 10 on Free to show what Pro adds. */
  maxReviews: number;
  /** The plan's own reviews-per-widget allowance, when lower than maxReviews. */
  saveReviews?: number;
  planName?: string;
  footer?: ReactNode;
  /** False on Free: Pro choices carry a badge and can be tried, not saved. */
  canUsePro?: boolean;
}) {
  const [tab, setTab] = useState<TabId>("layout");
  const set = (patch: Partial<WidgetSettings>) => onChange({ ...value, ...patch });
  const theme = value.theme ?? "light";
  const layout = value.layout === ("compact" as Layout) ? "quotes" : (value.layout ?? "grid");
  const limit = Math.min(saveReviews ?? maxReviews, maxReviews);
  const count = Math.min(value.reviewCount ?? limit, maxReviews);

  return (
    <aside className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-card lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
      <div className="grid grid-cols-4 gap-1 border-b border-line p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11.5px] font-semibold transition ${
              tab === t.id ? "bg-brand-wash text-brand" : "text-muted hover:bg-sand hover:text-ink"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {tab === "layout" && (
          <>
            <Section title="Layout">
              <div className="grid grid-cols-3 gap-2">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    title={l.hint}
                    onClick={() => set({ layout: l.id })}
                    className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11.5px] font-semibold transition ${
                      layout === l.id
                        ? "border-brand bg-brand-wash text-brand"
                        : "border-line text-muted hover:border-brand/40 hover:text-ink"
                    }`}
                  >
                    {!canUsePro && isProLayout(l.id) && (
                      <span className="absolute right-1 top-1 rounded bg-amber-100 px-1 text-[9px] font-bold uppercase leading-4 tracking-wide text-amber-700">
                        Pro
                      </span>
                    )}
                    <span className={layout === l.id ? "text-brand/70" : "text-hint/60"}>
                      <LayoutSketch id={l.id} />
                    </span>
                    {l.label}
                  </button>
                ))}
              </div>
              {!canUsePro && isProLayout(layout) && (
                <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                  {layoutName(layout)} is a Pro design. Try it here; to use it on your site,{" "}
                  <Link href="/dashboard/billing" className="font-semibold underline">
                    upgrade
                  </Link>
                  . Grid, List and Carousel are free.
                </p>
              )}
            </Section>

            {layout === "carousel" && (
              <Section title="Carousel" hint="Moves one review every few seconds; waits while someone hovers or touches it.">
                <ToggleRow label="Autoplay" k="autoplay" value={value} set={set} />
              </Section>
            )}

            {layout !== "list" && (
              <Section
                title={layout === "carousel" ? "Cards per view" : "Columns"}
                hint="Auto fits as many as the space allows."
              >
                <Segmented
                  value={value.gridColumns ?? "auto"}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "1", label: "1" },
                    { value: "2", label: "2" },
                    { value: "3", label: "3" },
                    { value: "4", label: "4" },
                  ]}
                  onChange={(v) => set({ gridColumns: v === "auto" ? undefined : (v as WidgetSettings["gridColumns"]) })}
                />
              </Section>
            )}

            <Section title="Theme">
              <Segmented
                value={theme}
                options={[
                  { value: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
                  { value: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
                ]}
                onChange={(v) => set({ theme: v as "light" | "dark" })}
              />
            </Section>

            <BackgroundPicker value={value} set={set} canUsePro={canUsePro} />

            <Section title="Reviews to show">
              <div className="flex items-center justify-between rounded-xl border border-line px-2 py-1.5">
                <button
                  type="button"
                  aria-label="Fewer"
                  disabled={count <= 1}
                  onClick={() => set({ reviewCount: Math.max(1, count - 1) })}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink hover:bg-sand disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-[15px] font-bold tabular-nums">{count}</span>
                <button
                  type="button"
                  aria-label="More"
                  disabled={count >= maxReviews}
                  onClick={() => set({ reviewCount: Math.min(maxReviews, count + 1) })}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink hover:bg-sand disabled:opacity-30"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {count > limit ? (
                <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                  Your site shows {limit} on the {planName || "current"} plan. Try {count} here;{" "}
                  <Link href="/dashboard/billing" className="font-semibold underline">
                    upgrade
                  </Link>{" "}
                  to show them on your site.
                </p>
              ) : (
                <p className="mt-1.5 text-[11.5px] text-muted">
                  {planName ? `${planName} plan: ` : ""}up to {limit} per widget.{" "}
                  {count >= limit && planName !== "Admin" && (
                    <Link href="/dashboard/billing" className="font-semibold text-brand hover:underline">
                      Show more
                    </Link>
                  )}
                </p>
              )}
            </Section>

            {canUsePro ? (
              <Section
                title="Order"
                hint="Fetches fresh reviews when you save, so the preview will not update until then."
              >
                <select
                  value={value.sort ?? "mostRelevant"}
                  onChange={(e) => set({ sort: e.target.value as WidgetSettings["sort"] })}
                  className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[13px] font-medium outline-none focus:border-brand"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Section>
            ) : (
              <Section title="Order">
                <p className="rounded-xl border border-line px-3 py-2.5 text-[13px] font-medium text-ink">
                  Highest rated
                </p>
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                  Free widgets show your highest-rated 5-star reviews. Newest first and Most relevant are part of
                  Pro.{" "}
                  <Link href="/dashboard/billing" className="font-semibold underline">
                    Upgrade
                  </Link>
                </p>
              </Section>
            )}

            <Section
              title="Filters"
              hint={canUsePro ? "Applied when you save. Only 5-star reviews are ever shown." : undefined}
            >
              {!canUsePro && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                  Filters are part of Pro.{" "}
                  <Link href="/dashboard/billing" className="font-semibold underline">
                    Upgrade
                  </Link>{" "}
                  to choose which reviews your widget shows.
                </p>
              )}
              <WordsField
                label="Hide reviews that mention"
                placeholder="Words or names, separated by commas"
                value={value.excludeWords}
                disabled={!canUsePro}
                onChange={(v) => set({ excludeWords: v })}
              />
              <WordsField
                label="Only show reviews that mention"
                placeholder="Words, separated by commas"
                value={value.includeWords}
                disabled={!canUsePro}
                onChange={(v) => set({ includeWords: v })}
              />
              <SwitchRow
                label="Only reviews with photos"
                on={value.photosOnly === true}
                disabled={!canUsePro}
                onToggle={() => set({ photosOnly: !value.photosOnly })}
              />
            </Section>
          </>
        )}

        {tab === "content" && (
          <>
            <Section title="Header">
              <Segmented
                value={value.headerAlign ?? "center"}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                ]}
                onChange={(v) => set({ headerAlign: v as WidgetSettings["headerAlign"] })}
              />
              <ToggleRow label="“Google Reviews” label" k="showHeaderGoogle" value={value} set={set} />
              <ToggleRow label="Business name" k="showBusinessName" value={value} set={set} />
              <ToggleRow label="Overall rating" k="showOverallRating" value={value} set={set} />
              <ToggleRow label="“Write a review” button" k="showWriteReviewBtn" value={value} set={set} />
              {isOn(value, "showWriteReviewBtn") && (
                <IconPicker
                  value={value.writeButtonIcon ?? "chat"}
                  onChange={(v) => set({ writeButtonIcon: v })}
                />
              )}
            </Section>
            <Section title="Reviews">
              <ToggleRow label="Show reviews" k="showReviews" value={value} set={set} />
              <ToggleRow label="Reviewer photo" k="showReviewerPhoto" value={value} set={set} disabled={!isOn(value, "showReviews")} />
              <ToggleRow label="Review date" k="showReviewDate" value={value} set={set} disabled={!isOn(value, "showReviews")} />
              <ToggleRow label="Photos in reviews" k="showReviewPhotos" value={value} set={set} disabled={!isOn(value, "showReviews")} />
              <ToggleRow label="Google logo on each review" k="showGoogleIcon" value={value} set={set} disabled={!isOn(value, "showReviews")} />
              <ToggleRow label="“Read more” on long reviews" k="readMore" value={value} set={set} disabled={!isOn(value, "showReviews")} />
            </Section>
            <Section title="Footer">
              <ToggleRow label="“See all reviews” button" k="showAllReviewsBtn" value={value} set={set} />
              {isOn(value, "showAllReviewsBtn") && (
                <>
                  <IconPicker
                    // Older widgets only had an on/off Google logo here.
                    value={value.allButtonIcon ?? (value.buttonIcon ? "google" : "none")}
                    onChange={(v) => set({ allButtonIcon: v })}
                  />
                  <div className="pt-1">
                    <Segmented
                      value={value.buttonPosition ?? "center"}
                      options={[
                        { value: "left", label: "Left" },
                        { value: "center", label: "Center" },
                        { value: "right", label: "Right" },
                        { value: "full", label: "Full" },
                      ]}
                      onChange={(v) => set({ buttonPosition: v as WidgetSettings["buttonPosition"] })}
                    />
                  </div>
                </>
              )}
            </Section>
          </>
        )}

        {tab === "colors" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-muted">
                <b className="text-ink">Auto</b> follows the {theme} theme.
              </p>
              <button
                type="button"
                onClick={() => {
                  const next = { ...value };
                  for (const f of COLOR_FIELDS) delete next[f.key];
                  onChange(next);
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-muted hover:bg-sand hover:text-brand"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset all
              </button>
            </div>
            {["Widget", "Text", "Accents"].map((group) => (
              <Section key={group} title={group}>
                <div className="space-y-3.5">
                  {/* The background has its own picker on the Layout tab. */}
                  {COLOR_FIELDS.filter((f) => f.group === group && f.key !== "backgroundColor").map((f) => (
                    <ColorRow
                      key={f.key}
                      label={f.label}
                      value={value[f.key]}
                      auto={themeColor(f.key, theme)}
                      onChange={(c) => set({ [f.key]: c } as Partial<Record<ColorKey, string | undefined>>)}
                    />
                  ))}
                </div>
              </Section>
            ))}
          </>
        )}

        {tab === "style" && (
          <>
            <Section title="Corners">
              <Segmented
                value={value.radius ?? "md"}
                options={[
                  { value: "none", label: "Square" },
                  { value: "md", label: "Rounded" },
                  { value: "lg", label: "Soft" },
                ]}
                onChange={(v) => set({ radius: v as WidgetSettings["radius"] })}
              />
            </Section>
            <Section title="Review length" hint="Longer reviews are cut with “…”.">
              <Segmented
                value={value.textLines ?? "6"}
                options={[
                  { value: "3", label: "Short" },
                  { value: "6", label: "Medium" },
                  { value: "all", label: "Full" },
                ]}
                onChange={(v) => set({ textLines: v as WidgetSettings["textLines"] })}
              />
            </Section>
            <Section title="Cards">
              <ToggleRow label="Border" k="cardBorder" value={value} set={set} />
              <ToggleRow label="Shadow" k="cardShadow" value={value} set={set} />
            </Section>
            <Section title="Review text">
              <ToggleRow label="Bold" k="reviewBold" value={value} set={set} />
              <ToggleRow label="Italic" k="reviewItalic" value={value} set={set} />
            </Section>
          </>
        )}
      </div>

      {footer && <div className="border-t border-line p-4">{footer}</div>}
    </aside>
  );
}

const BACKGROUNDS: { id: BackgroundMode; label: string; hint: string }[] = [
  { id: "theme", label: "Theme", hint: "A soft panel in the theme's colours." },
  {
    id: "transparent",
    label: "Transparent",
    hint: "Sits on your website's own colour. The heading turns light or dark to match it.",
  },
  { id: "custom", label: "Custom", hint: "Any colour. The heading turns light or dark to match it." },
];

/** Theme panel (free), transparent or a colour of their own (Pro). */
function BackgroundPicker({
  value,
  set,
  canUsePro,
}: {
  value: WidgetSettings;
  set: (patch: Partial<WidgetSettings>) => void;
  canUsePro: boolean;
}) {
  const theme = value.theme ?? "light";
  const mode = backgroundMode(value);
  const pick = (id: BackgroundMode) => {
    if (id === "custom") {
      set({ backgroundColor: value.backgroundColor ?? (theme === "dark" ? "#1e293b" : "#eef2ff") });
    } else {
      set({ background: id, backgroundColor: undefined });
    }
  };
  const swatch = (id: BackgroundMode) =>
    id === "theme"
      ? { background: themeColor("backgroundColor", theme) }
      : id === "transparent"
        ? {
            backgroundImage: "conic-gradient(#e2e8f0 25%, #fff 0 50%, #e2e8f0 0 75%, #fff 0)",
            backgroundSize: "8px 8px",
          }
        : {
            background:
              value.backgroundColor ??
              "conic-gradient(#f43f5e, #f59e0b, #10b981, #0ea5e9, #6366f1, #f43f5e)",
          };

  return (
    <Section title="Background" hint={BACKGROUNDS.find((b) => b.id === mode)?.hint}>
      <div className="grid grid-cols-3 gap-2">
        {BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            type="button"
            aria-pressed={mode === b.id}
            onClick={() => pick(b.id)}
            className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11.5px] font-semibold transition ${
              mode === b.id
                ? "border-brand bg-brand-wash text-brand"
                : "border-line text-muted hover:border-brand/40 hover:text-ink"
            }`}
          >
            {!canUsePro && b.id !== "theme" && (
              <span className="absolute right-1 top-1 rounded bg-amber-100 px-1 text-[9px] font-bold uppercase leading-4 tracking-wide text-amber-700">
                Pro
              </span>
            )}
            <span className="h-6 w-9 rounded-md border border-line" style={swatch(b.id)} />
            {b.label}
          </button>
        ))}
      </div>
      {mode === "custom" && (
        <div className="pt-2">
          <ColorRow
            label="Background colour"
            value={value.backgroundColor}
            auto={themeColor("backgroundColor", theme)}
            onChange={(c) => set({ backgroundColor: c })}
            allowAuto={false}
          />
        </div>
      )}
      {!canUsePro && mode !== "theme" && (
        <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
          {mode === "transparent" ? "A transparent" : "A custom"} background is part of Pro. Try it here; to use it on
          your site,{" "}
          <Link href="/dashboard/billing" className="font-semibold underline">
            upgrade
          </Link>
          . The theme background is free.
        </p>
      )}
    </Section>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{title}</p>
      <div className="space-y-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[11.5px] text-hint">{hint}</p>}
    </section>
  );
}

/** Which icon a button carries, or none. */
function IconPicker({
  value,
  onChange,
}: {
  value: ButtonIcon;
  onChange: (v: ButtonIcon) => void;
}) {
  return (
    <div className="pt-1">
      <p className="mb-1.5 text-[12px] font-medium text-muted">Button icon</p>
      <Segmented
        value={value}
        options={[
          { value: "google", label: "Google" },
          { value: "chat", label: "Chat", icon: <MessageSquare className="h-3 w-3" /> },
          { value: "star", label: "Star", icon: <Star className="h-3 w-3 fill-current" /> },
          { value: "none", label: "None" },
        ]}
        onChange={(v) => onChange(v as ButtonIcon)}
      />
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; icon?: ReactNode }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-xl border border-line bg-sand p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition ${
            value === o.value ? "bg-card text-brand shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A comma list of words or names for a filter. */
function WordsField({
  label,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  value?: string;
  disabled?: boolean;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted">{label}</span>
      <input
        value={value ?? ""}
        disabled={disabled}
        maxLength={300}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[13px] outline-none focus:border-brand disabled:opacity-50"
      />
    </label>
  );
}

function ToggleRow({
  label,
  k,
  value,
  set,
  disabled,
}: {
  label: string;
  k: ToggleKey;
  value: WidgetSettings;
  set: (patch: Partial<WidgetSettings>) => void;
  disabled?: boolean;
}) {
  const on = isOn(value, k);
  return (
    <SwitchRow
      label={label}
      on={on}
      disabled={disabled}
      onToggle={() => set({ [k]: !on } as Partial<WidgetSettings>)}
    />
  );
}

function SwitchRow({
  label,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition hover:border-brand/30 disabled:opacity-40"
    >
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-line"}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function ColorRow({
  label,
  value,
  auto,
  onChange,
  allowAuto = true,
}: {
  label: string;
  value: string | undefined;
  auto: string;
  onChange: (c: string | undefined) => void;
  /** Off where "follow the theme" is a separate choice. */
  allowAuto?: boolean;
}) {
  const current = value ?? auto;
  const same = (c: string) => value?.toLowerCase() === c.toLowerCase();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        <span className="font-mono text-[11px] uppercase text-muted">{value ?? "auto"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {allowAuto && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            title="Follow the theme"
            className={`h-6 rounded-full border px-2 text-[10.5px] font-bold transition ${
              value === undefined ? "border-brand bg-brand-wash text-brand" : "border-line text-muted hover:text-ink"
            }`}
          >
            Auto
          </button>
        )}
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            style={{ background: c }}
            className={`grid h-6 w-6 place-items-center rounded-full border transition hover:scale-110 ${
              same(c) ? "border-transparent ring-2 ring-brand ring-offset-1" : "border-line"
            }`}
          >
            {same(c) && <Check className="h-3 w-3" style={{ color: c === "#ffffff" || c === "#f59e0b" ? "#1e293b" : "#ffffff" }} />}
          </button>
        ))}
        <label
          title="Pick any color"
          className="relative grid h-6 w-6 cursor-pointer place-items-center overflow-hidden rounded-full border border-line bg-card hover:scale-110"
        >
          <Pipette className="h-3 w-3 text-muted" />
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
