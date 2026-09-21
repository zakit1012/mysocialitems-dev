"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Star,
  Loader2,
  Moon,
  Sun,
  MessageSquare,
  LayoutGrid,
  Type,
  AlignLeft,
  Columns,
  List,
  Check,
  Palette,
  Eye,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/Button";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/* ─── dummy data ─── */
const DUMMY_REVIEWS = [
  { id: 1, author: "Sarah Jenkins", text: "Absolutely loved the experience! Highly recommend to anyone looking for top quality service.", rating: 5, date: "2 days ago" },
  { id: 2, author: "Michael Chen", text: "Great service and friendly staff. Will definitely be coming back again soon.", rating: 5, date: "1 week ago" },
  { id: 3, author: "Emma Thompson", text: "Very good overall, but it can get a bit crowded on weekends. Book ahead!", rating: 4, date: "2 weeks ago" },
  { id: 4, author: "David Wilson", text: "Exceeded all my expectations. The attention to detail is outstanding.", rating: 5, date: "1 month ago" },
  { id: 5, author: "Olivia Martinez", text: "Beautiful atmosphere and perfect attention to detail. A hidden gem!", rating: 5, date: "2 months ago" },
];

const LAYOUTS = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "masonry", label: "Masonry", icon: Columns },
  { id: "list", label: "List", icon: List },
  { id: "carousel", label: "Carousel", icon: AlignLeft },
  { id: "compact", label: "Compact", icon: Type },
];

const SWATCHES = [
  { id: "amber",   hex: "#F59E0B", label: "Amber" },
  { id: "brand",   hex: "#E8446D", label: "Rose" },
  { id: "emerald", hex: "#10B981", label: "Emerald" },
  { id: "indigo",  hex: "#6366F1", label: "Indigo" },
  { id: "coral",   hex: "#F43F5E", label: "Coral" },
  { id: "sky",     hex: "#0EA5E9", label: "Sky" },
  { id: "violet",  hex: "#8B5CF6", label: "Violet" },
  { id: "slate",   hex: "#475569", label: "Slate" },
  { id: "white",   hex: "#FFFFFF", label: "White" },
  { id: "dark",    hex: "#1E293B", label: "Dark" },
];

const AVATAR_COLORS = [
  "from-brand to-coral",
  "from-indigo to-brand",
  "from-emerald to-indigo",
  "from-amber to-brand",
  "from-coral to-amber",
];

const TABS = [
  { id: "design", label: "Design", icon: LayoutGrid },
  { id: "colors", label: "Colors", icon: Palette },
  { id: "toggle", label: "Toggle", icon: Eye },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function EditWidgetPage() {
  const { token } = useAuth();
  const router = useRouter();
  const params = useParams();
  const widgetId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [placeName, setPlaceName] = useState("");

  /* widget settings */
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [layout, setLayout] = useState("grid");
  const [starColor, setStarColor] = useState("amber");
  const [reviewTextColor, setReviewTextColor] = useState("slate");
  const [headerColor, setHeaderColor] = useState("dark");

  const [showReviews, setShowReviews] = useState(true);
  const [showBusinessName, setShowBusinessName] = useState(true);
  const [showOverallRating, setShowOverallRating] = useState(true);
  const [showWriteReview, setShowWriteReview] = useState(true);

  const [tab, setTab] = useState<TabId>("design");

  /* carousel scroll ref */
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollCarousel = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -260 : 260, behavior: "smooth" });
  };

  useEffect(() => {
    if (!token || !widgetId) return;
    
    api(`/widgets/${widgetId}`, { token })
      .then((data: any) => {
        setPlaceName(data.placeName);
        const s = data.settings || {};
        if (s.theme) setTheme(s.theme);
        if (s.layout) setLayout(s.layout);
        if (s.starColor) setStarColor(s.starColor);
        if (s.reviewTextColor) setReviewTextColor(s.reviewTextColor);
        if (s.headerColor) setHeaderColor(s.headerColor);
        
        if (s.showReviews !== undefined) setShowReviews(s.showReviews);
        if (s.showBusinessName !== undefined) setShowBusinessName(s.showBusinessName);
        if (s.showOverallRating !== undefined) setShowOverallRating(s.showOverallRating);
        if (s.showWriteReview !== undefined) setShowWriteReview(s.showWriteReview);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load widget");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, widgetId]);

  /* save handler */
  async function updateWidget() {
    setSaving(true);
    setError("");
    try {
      await api(`/widgets/${widgetId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          settings: {
            theme, layout, starColor, reviewTextColor, headerColor,
            showReviews, showBusinessName, showOverallRating, showWriteReview,
          },
        }),
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update widget");
      setSaving(false);
    }
  }

  /* helpers */
  const dark = theme === "dark";
  const getHex = (id: string) => SWATCHES.find((s) => s.id === id)?.hex ?? "#475569";

  const StarIcon = ({ filled, size = 14 }: { filled: boolean; size?: number }) => (
    <Star
      style={{ width: size, height: size, color: getHex(starColor), fill: filled ? getHex(starColor) : "transparent" }}
      strokeWidth={filled ? 0 : 1.5}
    />
  );

  const StarsRow = ({ rating, size = 14 }: { rating: number; size?: number }) => (
    <span className="inline-flex gap-px">
      {[...Array(5)].map((_, i) => <StarIcon key={i} filled={i < rating} size={size} />)}
    </span>
  );

  const Avatar = ({ name, idx, size = 36 }: { name: string; idx: number; size?: number }) => (
    <div
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full bg-gradient-to-br ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} flex items-center justify-center text-white font-bold`}
    >
      <span style={{ fontSize: size * 0.4 }}>{name.charAt(0)}</span>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (error && !placeName) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-4">
        <p className="text-coral">{error}</p>
        <Link href="/dashboard" className="text-brand hover:underline">Go back to dashboard</Link>
      </div>
    );
  }

  /* ─────── BUILDER ─────── */
  const reviewColor = getHex(reviewTextColor);
  const headColor = getHex(headerColor);

  return (
    <div className="animate-fade-in-up">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-brand">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to widgets
      </Link>

      <div className="mt-5 flex items-center gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-dark shadow-glow">
          <Settings2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Edit widget</h1>
          <p className="text-xs text-muted">Update settings for <span className="font-semibold text-ink">{placeName}</span>.</p>
        </div>
      </div>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[280px_1fr]">
        {/* ── LEFT: tabbed settings ── */}
        <aside className="overflow-hidden rounded-2xl border border-line/60 bg-card shadow-sm">
          <div className="flex border-b border-line/60">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition ${
                  tab === t.id
                    ? "border-b-2 border-brand text-brand bg-brand-wash/40"
                    : "text-muted hover:text-ink hover:bg-sand-deep/50"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Theme</p>
              <div className="flex rounded-full border border-line bg-sand-deep p-0.5">
                <button onClick={() => setTheme("light")} className={`rounded-full p-1.5 transition-colors ${!dark ? "bg-white shadow-sm text-amber" : "text-muted"}`}>
                  <Sun className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setTheme("dark")} className={`rounded-full p-1.5 transition-colors ${dark ? "bg-dark text-white shadow-sm" : "text-muted"}`}>
                  <Moon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {tab === "design" && (
              <div className="space-y-4 animate-fade-in-up">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Layout</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setLayout(l.id)}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[10px] font-semibold transition ${
                        layout === l.id
                          ? "border-brand bg-brand-wash text-brand"
                          : "border-transparent text-muted hover:bg-sand-deep"
                      }`}
                    >
                      <l.icon className="h-4 w-4" />
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === "colors" && (
              <div className="space-y-5 animate-fade-in-up">
                <ColorPicker label="Star color" value={starColor} onChange={setStarColor} />
                <ColorPicker label="Review text" value={reviewTextColor} onChange={setReviewTextColor} />
                <ColorPicker label="Header text" value={headerColor} onChange={setHeaderColor} />
              </div>
            )}

            {tab === "toggle" && (
              <div className="space-y-2 animate-fade-in-up">
                <Toggle label="Business name" on={showBusinessName} set={setShowBusinessName} />
                <Toggle label="Overall rating" on={showOverallRating} set={setShowOverallRating} />
                <Toggle label="Write review btn" on={showWriteReview} set={setShowWriteReview} />
                <Toggle label="Reviews" on={showReviews} set={setShowReviews} />
              </div>
            )}

            <Button loading={saving} onClick={updateWidget} className="w-full">
              Save changes
            </Button>
            {error && <p className="text-center text-xs text-coral">{error}</p>}
          </div>
        </aside>

        {/* ── RIGHT: live preview ── */}
        <div className="min-w-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Live preview</p>

          <div className={`overflow-hidden rounded-2xl border shadow-panel transition-colors duration-300 ${dark ? "border-dark-line bg-dark" : "border-line bg-card"}`}>
            {(showBusinessName || showOverallRating || showWriteReview) && (
              <div className={`flex flex-wrap items-center justify-between gap-4 px-6 py-5 transition-colors duration-300 ${dark ? "border-b border-dark-line bg-dark-card" : "border-b border-line bg-sand/60"}`}>
                <div className="space-y-1.5">
                  {showBusinessName && (
                    <h3 className="text-lg font-extrabold tracking-tight" style={{ color: headColor }}>
                      {placeName}
                    </h3>
                  )}
                  {showOverallRating && (
                    <div className="flex items-center gap-2">
                      <StarsRow rating={5} size={16} />
                      <span className="text-sm font-bold" style={{ color: headColor }}>4.8</span>
                      <span className={`text-xs ${dark ? "text-dark-muted" : "text-muted"}`}>· 1,284 reviews</span>
                    </div>
                  )}
                </div>
                {showWriteReview && (
                  <button className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition hover:scale-[1.03] ${dark ? "bg-white text-dark" : "gradient-brand text-white shadow-glow"}`}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    Write a review
                  </button>
                )}
              </div>
            )}

            {showReviews && (
              <div className="relative p-5">
                {layout === "carousel" && (
                  <>
                    <button onClick={() => scrollCarousel("left")} className={`absolute left-1.5 top-1/2 z-10 -translate-y-1/2 rounded-full border p-1.5 shadow transition hover:scale-110 ${dark ? "border-dark-line bg-dark-card text-white" : "border-line bg-white text-ink"}`}>
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button onClick={() => scrollCarousel("right")} className={`absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-full border p-1.5 shadow transition hover:scale-110 ${dark ? "border-dark-line bg-dark-card text-white" : "border-line bg-white text-ink"}`}>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}

                {layout === "grid" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {DUMMY_REVIEWS.map((r, i) => (
                      <div key={r.id} className={`rounded-xl border p-4 transition-colors ${dark ? "border-dark-line bg-dark-card/40" : "border-line/60 bg-sand/40"}`}>
                        <div className="flex items-center gap-3">
                          <Avatar name={r.author} idx={i} size={34} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold" style={{ color: headColor }}>{r.author}</p>
                            <p className={`text-[11px] ${dark ? "text-dark-muted" : "text-muted"}`}>{r.date}</p>
                          </div>
                        </div>
                        <div className="mt-3"><StarsRow rating={r.rating} size={13} /></div>
                        <p className="mt-2 text-xs leading-relaxed" style={{ color: reviewColor }}>&ldquo;{r.text}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                )}

                {layout === "masonry" && (
                  <div className="columns-2 gap-4">
                    {DUMMY_REVIEWS.map((r, i) => (
                      <div key={r.id} className={`mb-4 break-inside-avoid rounded-2xl p-5 transition-colors ${dark ? "bg-dark-card" : "bg-sand-deep"}`}>
                        <StarsRow rating={r.rating} size={14} />
                        <p className="mt-3 text-[13px] font-medium italic leading-relaxed" style={{ color: reviewColor }}>&ldquo;{r.text}&rdquo;</p>
                        <div className="mt-4 flex items-center gap-2.5">
                          <Avatar name={r.author} idx={i} size={26} />
                          <div>
                            <p className="text-xs font-bold" style={{ color: headColor }}>{r.author}</p>
                            <p className={`text-[10px] ${dark ? "text-dark-muted" : "text-muted"}`}>{r.date}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {layout === "list" && (
                  <div className={`divide-y ${dark ? "divide-dark-line" : "divide-line/60"}`}>
                    {DUMMY_REVIEWS.map((r, i) => (
                      <div key={r.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                        <Avatar name={r.author} idx={i} size={38} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold" style={{ color: headColor }}>{r.author}</p>
                            <StarsRow rating={r.rating} size={12} />
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed" style={{ color: reviewColor }}>&ldquo;{r.text}&rdquo;</p>
                          <p className={`mt-1 text-[10px] ${dark ? "text-dark-muted" : "text-muted"}`}>{r.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {layout === "carousel" && (
                  <div ref={scrollRef} className="flex snap-x snap-mandatory gap-4 overflow-x-auto no-scrollbar px-6 scroll-smooth">
                    {DUMMY_REVIEWS.map((r, i) => (
                      <div key={r.id} className={`w-[240px] shrink-0 snap-start rounded-2xl border p-5 transition-colors ${dark ? "border-dark-line bg-dark-card" : "border-line bg-white shadow-card"}`}>
                        <div className="flex items-center gap-3">
                          <Avatar name={r.author} idx={i} size={32} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold" style={{ color: headColor }}>{r.author}</p>
                            <StarsRow rating={r.rating} size={11} />
                          </div>
                        </div>
                        <p className="mt-3 text-xs leading-relaxed" style={{ color: reviewColor }}>&ldquo;{r.text}&rdquo;</p>
                        <p className={`mt-2 text-[10px] ${dark ? "text-dark-muted" : "text-muted"}`}>{r.date}</p>
                      </div>
                    ))}
                  </div>
                )}

                {layout === "compact" && (
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    {DUMMY_REVIEWS.map((r) => (
                      <div key={r.id} className={`rounded-lg border p-3 transition-colors ${dark ? "border-dark-line bg-dark-card/40" : "border-line/60 bg-sand/40"}`}>
                        <div className="flex items-center justify-between">
                          <p className="truncate text-xs font-bold" style={{ color: headColor }}>{r.author}</p>
                          <StarsRow rating={r.rating} size={10} />
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug" style={{ color: reviewColor }}>&ldquo;{r.text}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full border border-line" style={{ background: SWATCHES.find((s) => s.id === value)?.hex }} />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SWATCHES.map((s) => (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            title={s.label}
            style={{ background: s.hex }}
            className={`h-6 w-6 rounded-full border transition ${
              value === s.id
                ? "ring-2 ring-brand ring-offset-1 border-transparent scale-110"
                : "border-line/40 hover:scale-110"
            } ${s.id === "white" ? "border-line!" : ""}`}
          >
            {value === s.id && <Check className="mx-auto h-3 w-3" style={{ color: s.id === "white" || s.id === "amber" ? "#1E293B" : "#FFFFFF" }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-sand-deep px-3 py-2 transition hover:bg-sand">
      <span className="text-[11px] font-medium text-ink">{label}</span>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => set(!on)}
        className={`relative inline-flex h-[18px] w-[32px] shrink-0 rounded-full transition-colors ${on ? "bg-emerald" : "bg-line"}`}
      >
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-[15px]" : "translate-x-[2px]"}`} />
      </button>
    </label>
  );
}
