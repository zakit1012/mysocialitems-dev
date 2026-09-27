"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Code2,
  Images,
  LayoutDashboard,
  LayoutGrid,
  MousePointerClick,
  Palette,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { WidgetPreview } from "@/components/widget/WidgetPreview";
import { DEFAULT_SETTINGS, type Layout, type WidgetSettings } from "@/lib/widget-settings";
import { DEMO_REVIEW_COUNT, demoData } from "@/lib/demo-data";
import { FAQ } from "@/lib/faq";
import { rupees, useInIndiaOrUnknown } from "@/lib/region";
import { HOSTS, SITE, appHref } from "@/lib/site";

type PublicPlan = {
  id: string;
  name: string;
  priceUsd: number;
  sources: number;
  widgets: number;
  reviews: number;
  views: number | null;
  refreshHours: number;
  priceYearlyUsd?: number;
  /** Rupee prices from Admin -> Plans, shown to visitors in India. */
  priceInr?: number | null;
  priceYearlyInr?: number | null;
};

/** Shown until the live plans load, and if the API is unreachable. */
const DEFAULT_PLANS: PublicPlan[] = [
  { id: "FREE", name: "Free", priceUsd: 0, sources: 1, widgets: 1, reviews: 3, views: 200, refreshHours: 48 },
  { id: "PRO", name: "Pro", priceUsd: 5, sources: 3, widgets: 3, reviews: 10, views: null, refreshHours: 24, priceYearlyUsd: 50 },
  { id: "BUSINESS", name: "Business", priceUsd: 10, sources: 8, widgets: 8, reviews: 50, views: null, refreshHours: 12, priceYearlyUsd: 100 },
];

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

const PLATFORMS = ["WordPress", "Shopify", "Wix", "Webflow", "Squarespace", "Framer", "Any HTML site"];

const STEPS = [
  {
    icon: Search,
    title: "Find your business",
    text: "Type your business name or paste its Google Maps link. No Google login, no API keys.",
  },
  {
    icon: Palette,
    title: "Make it yours",
    text: "Pick a layout, colors and buttons. The live preview shows exactly what visitors will see.",
  },
  {
    icon: Code2,
    title: "Paste one line",
    text: "Copy the snippet into your site once. From then on, reviews and design changes update on their own.",
  },
];

const FEATURES = [
  {
    icon: Star,
    title: "Only your 5-star reviews",
    text: "Visitors see your happiest customers. Your overall rating and a link to every review stay visible.",
  },
  {
    icon: RefreshCw,
    title: "Always up to date",
    text: "New reviews appear on their own, as often as every 12 hours. Nothing to refresh by hand.",
  },
  {
    icon: LayoutGrid,
    title: "Six layouts",
    text: "Carousel, grid, masonry, list, big quotes or an even showcase row.",
  },
  {
    icon: Palette,
    title: "Matches your brand",
    text: "Your colors, light or dark, rounded or sharp, and the button icons you like.",
  },
  {
    icon: Images,
    title: "Photo gallery",
    text: "Review photos open full screen, with arrows and swipe to see every picture.",
  },
  {
    icon: Smartphone,
    title: "Made for phones",
    text: "Whole cards on every screen size, one per swipe on mobile.",
  },
  {
    icon: ShieldCheck,
    title: "Locked to your website",
    text: "A widget only loads on the domains you allow, so nobody can copy it to their site.",
  },
  {
    icon: BarChart3,
    title: "Built-in analytics",
    text: "Views and button clicks per day, per widget and per website.",
  },
];

const DEMO_LAYOUTS: { id: Layout; label: string }[] = [
  { id: "carousel", label: "Carousel" },
  { id: "grid", label: "Grid" },
  { id: "quotes", label: "Quotes" },
  { id: "masonry", label: "Masonry" },
  { id: "showcase", label: "Showcase" },
  { id: "list", label: "List" },
];

/** The address bar in the screenshots: where the dashboard really lives. */
const APP_DOMAIN = HOSTS.app || SITE.domain;

export default function HomePage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PublicPlan[]>(DEFAULT_PLANS);
  // Prices show once the real ones are in (or the call failed), so the
  // built-in defaults never flash a different price first.
  const [pricesReady, setPricesReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<PublicPlan[]>("/billing/plans")
      .then((rows) => {
        if (!cancelled && Array.isArray(rows) && rows.length) setPlans(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPricesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loggedIn = Boolean(user);
  return (
    <div>
      <Hero loggedIn={loggedIn} />
      <Platforms />
      <LiveDemo />
      <HowItWorks />
      <Spotlights />
      <FeatureGrid />
      <Pricing plans={plans} loggedIn={loggedIn} pricesReady={pricesReady} />
      <Faq plans={plans} />
      <FinalCta loggedIn={loggedIn} />
    </div>
  );
}

/* ─────────────────────────────── shared bits */

function PrimaryCta({ loggedIn, label = "Create your free widget" }: { loggedIn: boolean; label?: string }) {
  return (
    <Link
      href={appHref(loggedIn ? "/dashboard" : "/register")}
      className="group inline-flex items-center justify-center gap-2 rounded-full gradient-brand px-7 py-3.5 text-sm font-bold text-white shadow-glow transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_32px_rgba(232,68,109,0.4)]"
    >
      {loggedIn ? (
        <>
          <LayoutDashboard className="h-4 w-4" /> Go to your dashboard
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </Link>
  );
}

function SectionHead({ eyebrow, title, text }: { eyebrow: string; title: React.ReactNode; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight md:text-[2.6rem] md:leading-[1.1]">{title}</h2>
      {text && <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">{text}</p>}
    </div>
  );
}

/** A screenshot in a light browser window. */
function BrowserFrame({ src, alt, url, priority }: { src: string; alt: string; url: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]">
      <div className="flex items-center gap-3 border-b border-line bg-sand px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-coral/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald/70" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-md bg-card px-3 py-1 text-center text-[11px] text-hint">{url}</span>
      </div>
      <Image src={src} alt={alt} width={2880} height={1800} priority={priority} sizes="(min-width: 1024px) 640px, 100vw" className="h-auto w-full" />
    </div>
  );
}

/* ─────────────────────────────── hero */

function Hero({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-brand/15 blur-3xl" />
        <div className="absolute top-40 -left-40 h-[420px] w-[420px] rounded-full bg-indigo/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(to bottom, black, transparent 85%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)",
          }}
        />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 md:pt-20 lg:grid-cols-[1fr_1.1fr] lg:gap-10 lg:pb-28">
        <div className="animate-fade-in-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-card px-3.5 py-1.5 text-xs font-semibold text-ink-soft shadow-card">
            <span className="flex text-amber" aria-hidden>
              {"★★★★★"}
            </span>
            Google reviews widget for your website
          </p>
          <h1 className="mt-6 text-[2.6rem] font-black leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-[3.6rem]">
            Turn your Google reviews into <span className="gradient-brand-text">more customers</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Show your 5-star Google reviews on your website with a beautiful widget that keeps itself up to
            date. Set up in about two minutes, with no coding and no Google login.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <PrimaryCta loggedIn={loggedIn} />
            <a
              href="#demo"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-card px-7 py-3.5 text-sm font-semibold text-ink shadow-card transition hover:border-brand/30 hover:text-brand"
            >
              <MousePointerClick className="h-4 w-4" /> Try the live demo
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
            {["Free plan, forever", "No credit card", "Works on any website"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-wash text-emerald">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative animate-fade-in-up delay-200 lg:-mr-24">
          <BrowserFrame
            src="/marketing/editor.png"
            alt="The widget editor: layout options on the left, a live preview of a review carousel on the right"
            url={`${APP_DOMAIN}/dashboard`}
            priority
          />
          {/* the same widget on a phone */}
          <div className="absolute -bottom-12 -left-6 hidden w-[150px] overflow-hidden rounded-[1.9rem] border-[7px] border-ink bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.45)] sm:block md:w-[170px]">
            <div className="relative aspect-[9/17]">
              <Image src="/marketing/phone.png" alt="The review widget on a phone" fill sizes="170px" className="object-cover object-top" />
            </div>
          </div>
          <div className="absolute -top-5 right-4 flex items-center gap-2 rounded-2xl border border-line bg-card px-3.5 py-2.5 text-xs font-semibold shadow-panel animate-float lg:right-28">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-wash text-emerald">
              <RefreshCw className="h-3.5 w-3.5" />
            </span>
            Reviews update automatically
          </div>
          <div
            className="absolute -bottom-6 right-6 hidden items-center gap-2 rounded-2xl border border-line bg-card px-3.5 py-2.5 text-xs font-semibold shadow-panel animate-float sm:flex lg:right-32"
            style={{ animationDelay: "1.5s" }}
          >
            <span className="text-amber" aria-hidden>
              ★★★★★
            </span>
            Only your 5-star reviews
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── platforms */

function Platforms() {
  return (
    <section className="border-y border-line/60 bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-7 md:flex-row md:justify-between">
        <p className="text-sm font-semibold text-muted">Works on every website builder</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {PLATFORMS.map((p) => (
            <li key={p} className="rounded-full border border-line bg-sand px-3.5 py-1.5 text-sm font-semibold text-ink-soft">
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────────── live demo */

function LiveDemo() {
  const [layout, setLayout] = useState<Layout>("carousel");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const settings: WidgetSettings = {
    ...DEFAULT_SETTINGS,
    layout,
    theme,
    headerAlign: "center",
    showAllReviewsBtn: true,
    cardShadow: true,
    autoplay: true,
    // Pro: sits on the page, so trying a dark or blue "site" above shows the
    // heading switching colour.
    background: "transparent",
    reviewCount: DEMO_REVIEW_COUNT,
  };
  // The demo photos need this page's origin (the widget draws http(s) images
  // only); the preview itself only runs in the browser.
  const data = useMemo(() => demoData(typeof window === "undefined" ? "" : window.location.origin), []);

  return (
    <section id="demo" className="scroll-mt-20 bg-sand">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <SectionHead
          eyebrow="Live demo"
          title="Click around. This is the real widget."
          text="The same widget your visitors get, running right here with a sample café. Switch the layout and theme."
        />
        <div className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-3">
          <div className="flex flex-wrap justify-center gap-1 rounded-2xl border border-line bg-card p-1 shadow-card" role="group" aria-label="Layout">
            {DEMO_LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={layout === l.id}
                onClick={() => setLayout(l.id)}
                className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                  layout === l.id ? "gradient-brand text-white shadow-card" : "text-muted hover:text-ink"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-2xl border border-line bg-card p-1 shadow-card" role="group" aria-label="Theme">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={theme === t}
                onClick={() => setTheme(t)}
                className={`rounded-xl px-3.5 py-2 text-sm font-semibold capitalize transition ${
                  theme === t ? "bg-ink text-white" : "text-muted hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-5xl">
          <WidgetPreview data={data} settings={settings} title="yourwebsite.com" />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── how it works */

function HowItWorks() {
  return (
    <section className="border-t border-line/60 bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <SectionHead eyebrow="How it works" title="Live on your site in three steps" />
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative rounded-3xl border border-line/60 bg-sand p-7">
              <span className="text-5xl font-black text-brand/15" aria-hidden>
                0{i + 1}
              </span>
              <span className="mt-2 grid h-12 w-12 place-items-center rounded-2xl bg-card text-brand shadow-card">
                <step.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-bold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─────────────────────────────── product spotlights */

function Spotlight({
  eyebrow,
  title,
  text,
  points,
  image,
  alt,
  url,
  flip,
}: {
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  image: string;
  alt: string;
  url: string;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? "lg:order-2" : ""}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
        <h3 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">{title}</h3>
        <p className="mt-4 text-lg leading-relaxed text-muted">{text}</p>
        <ul className="mt-6 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-[15px] text-ink-soft">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-wash text-brand">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? "lg:order-1" : ""}>
        <BrowserFrame src={image} alt={alt} url={url} />
      </div>
    </div>
  );
}

function Spotlights() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-line/60 bg-sand">
      <div className="mx-auto max-w-6xl space-y-24 px-4 py-20 md:py-28">
        <Spotlight
          eyebrow="Design"
          title="Make it look like part of your site"
          text="Every change shows up in the live preview as you make it, on desktop and on a phone."
          points={[
            "Six layouts, including a swipeable carousel",
            "Your colors, light or dark theme, corner style and text size",
            "Choose what shows: rating, photos, dates, buttons and their icons",
            "Save once. Your live site updates without touching the code again",
          ]}
          image="/marketing/editor.png"
          alt="The widget editor with layout, content, colors and style tabs next to a live preview"
          url={`${APP_DOMAIN}/dashboard/widgets`}
        />
        <Spotlight
          flip
          eyebrow="Analytics"
          title="See what your reviews do for you"
          text="Know how many people see your reviews and how many click through to Google."
          points={[
            "Views and button clicks for every day",
            "Numbers per widget and per website",
            "A heads-up before you reach your plan's monthly views",
          ]}
          image="/marketing/analytics.png"
          alt="The analytics page with monthly views, button clicks and a chart of views per day"
          url={`${APP_DOMAIN}/dashboard/analytics`}
        />
      </div>
    </section>
  );
}

/* ─────────────────────────────── feature grid */

function FeatureGrid() {
  return (
    <section className="border-t border-line/60 bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <SectionHead
          eyebrow="Everything included"
          title="Built to win trust, not to fiddle with"
          text="All the parts a review widget needs, and none of the setup."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl border border-line/60 bg-sand p-6 transition hover:-translate-y-0.5 hover:shadow-card">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-card text-brand shadow-card">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 font-bold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── pricing */

function Pricing({ plans, loggedIn, pricesReady }: { plans: PublicPlan[]; loggedIn: boolean; pricesReady: boolean }) {
  const [yearly, setYearly] = useState(false);
  // Visitors in India see rupees; everyone else sees dollars only. Until both
  // the region and the real prices are known, a placeholder holds the place.
  const inIndia = useInIndiaOrUnknown();
  const ready = pricesReady && inIndia !== null;
  return (
    <section id="pricing" className="scroll-mt-20 border-t border-line/60 bg-sand">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <SectionHead
          eyebrow="Pricing"
          title="Start free. Upgrade when it pays off."
          text="No credit card to start. Cancel any time."
        />
        <div className="mt-8 flex justify-center">
          <div className="flex rounded-full border border-line bg-card p-1 shadow-card" role="group" aria-label="Billing period">
            {[
              [false, "Monthly"],
              [true, "Yearly"],
            ].map(([value, label]) => (
              <button
                key={String(label)}
                type="button"
                aria-pressed={yearly === value}
                onClick={() => setYearly(value as boolean)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  yearly === value ? "gradient-brand text-white shadow-card" : "text-muted hover:text-ink"
                }`}
              >
                {label as string}
                {value === true && (
                  <span className={`ml-1.5 text-xs ${yearly ? "text-white/90" : "text-emerald-dark"}`}>2 months free</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {plans.map((p, i) => {
            const free = p.priceUsd <= 0;
            // The middle plan of three is the one we point people at.
            const featured = plans.length === 3 && i === 1;
            const rupee = inIndia && (free || p.priceInr != null);
            const fmt = rupee ? rupees : money;
            const perMonth = rupee ? (p.priceInr ?? 0) : p.priceUsd;
            const perYear = rupee
              ? (p.priceYearlyInr ?? perMonth * 10)
              : (p.priceYearlyUsd ?? p.priceUsd * 10);
            const showYearly = yearly && !free;
            return (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-3xl border p-7 ${
                  featured ? "border-brand/40 bg-card shadow-panel ring-1 ring-brand/20 md:-translate-y-3" : "border-line/60 bg-card shadow-card"
                }`}
              >
                {featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-brand px-4 py-1 text-xs font-bold text-white shadow-card">
                    Recommended
                  </span>
                )}
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className="mt-3 flex items-baseline gap-1">
                  {ready ? (
                    <span className="text-5xl font-black tracking-tight">{fmt(showYearly ? perYear : perMonth)}</span>
                  ) : (
                    <span aria-label="Loading price" className="inline-block h-12 w-28 animate-pulse rounded-xl bg-sand-deep" />
                  )}
                  <span className="text-sm text-muted">{free ? "forever" : showYearly ? "/year" : "/month"}</span>
                </p>
                <p className="mt-1 h-5 text-sm font-semibold text-emerald-dark">
                  {ready && showYearly && `${fmt(Math.round((perYear / 12) * 100) / 100)} a month, billed yearly`}
                </p>
                <ul className="mt-7 space-y-3 text-[15px] text-ink-soft">
                  {[
                    plural(p.widgets, "widget"),
                    plural(p.sources, "website"),
                    `Up to ${p.reviews} reviews per widget`,
                    p.views === null ? "Unlimited views" : `${p.views.toLocaleString()} views a month`,
                    `Reviews update every ${p.refreshHours} hours`,
                    "Analytics included",
                    ...(free
                      ? ["Grid, List and Carousel designs", "Small “Powered by” link"]
                      : [
                          "All 6 designs, transparent or custom background",
                          "No “Powered by” link",
                          "Review QR code poster and share link",
                        ]),
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2.5">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-wash text-emerald">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={appHref(loggedIn ? "/dashboard/billing" : "/register")}
                  className={`mt-8 block rounded-full py-3 text-center text-sm font-bold transition ${
                    featured
                      ? "gradient-brand text-white shadow-glow hover:shadow-[0_0_32px_rgba(232,68,109,0.35)]"
                      : "border border-line bg-sand text-ink hover:border-brand/40 hover:bg-brand-wash hover:text-brand-dark"
                  }`}
                >
                  {loggedIn ? "Manage plan" : free ? "Start free" : `Start with ${p.name}`}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── FAQ */

function Faq({ plans }: { plans: PublicPlan[] }) {
  const cadence = plans.map((p) => `${p.refreshHours} hours on ${p.name}`).join(", ");
  const free = plans.find((p) => p.priceUsd <= 0);
  const items = [
    FAQ.access,
    FAQ.websites,
    {
      q: "How often do new reviews show up?",
      a: `Automatically, on a schedule set by your plan: every ${cadence}.`,
    },
    FAQ.fiveStar,
    FAQ.speed,
    ...(free && free.views !== null
      ? [
          {
            q: `What happens after the ${free.views.toLocaleString()} free views?`,
            a: "The widget stops showing until the next month starts. We email you at 80% and at 100%, and the analytics page shows your usage. Upgrading brings it back straight away.",
          },
        ]
      : []),
    FAQ.cancel,
  ];

  return (
    <section id="faq" className="scroll-mt-20 border-t border-line/60 bg-card">
      <div className="mx-auto max-w-3xl px-4 py-20 md:py-28">
        <SectionHead eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-12 divide-y divide-line rounded-3xl border border-line/60 bg-sand">
          {items.map((item) => (
            <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink">
                {item.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────── final CTA */

function FinalCta({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="px-4 pb-20 pt-4 md:pb-28">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] gradient-hero px-6 py-16 text-center md:py-20">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-brand/25 blur-3xl" />
        </div>
        <div className="relative">
          <Sparkles className="mx-auto h-8 w-8 text-brand-light" />
          <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-black tracking-tight text-white md:text-5xl">
            Your happiest customers are your best salespeople
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-dark-text">
            Put their words on your website today. It takes about two minutes.
          </p>
          <div className="mt-9 flex justify-center">
            <PrimaryCta loggedIn={loggedIn} label="Create your free widget" />
          </div>
          <p className="mt-5 text-sm text-dark-muted">Free plan, forever · No credit card</p>
        </div>
      </div>
    </section>
  );
}
