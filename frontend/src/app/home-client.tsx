"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Code2,
  Globe,
  LayoutDashboard,
  Palette,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/* ─── Mock review data for the live preview ─── */
const MOCK_REVIEWS = [
  {
    author: "Sarah Mitchell",
    initial: "S",
    rating: 5,
    time: "2 weeks ago",
    text: "Absolutely fantastic experience! The team went above and beyond to make sure everything was perfect. Would highly recommend to anyone looking for top-quality service.",
    color: "bg-indigo",
  },
  {
    author: "James Rodriguez",
    initial: "J",
    rating: 5,
    time: "1 month ago",
    text: "Professional, friendly, and incredibly efficient. This is the best service I've ever used. Five stars all the way!",
    color: "bg-emerald",
  },
  {
    author: "Emily Chen",
    initial: "E",
    rating: 4,
    time: "3 weeks ago",
    text: "Great overall experience. The booking process was seamless and the quality exceeded my expectations. Will definitely return.",
    color: "bg-amber",
  },
];

const STEPS = [
  {
    icon: Globe,
    title: "Connect your Google Place",
    description:
      "Search for your business or paste a Google Maps URL. We'll pull your reviews instantly.",
    accent: "bg-indigo-wash text-indigo",
  },
  {
    icon: Palette,
    title: "Customize your widget",
    description:
      "Choose how many reviews to show, pick a layout, and match your brand's look and feel.",
    accent: "bg-brand-wash text-brand",
  },
  {
    icon: Code2,
    title: "Embed on your site",
    description:
      "Copy one line of code. Paste it anywhere — WordPress, Shopify, Wix, or plain HTML.",
    accent: "bg-emerald-wash text-emerald",
  },
];

const FEATURES = [
  {
    icon: RefreshCw,
    title: "Auto-sync reviews",
    description:
      "New Google reviews appear on your site automatically. No manual updates needed.",
    gradient: "from-indigo/10 to-indigo/5",
  },
  {
    icon: Zap,
    title: "Lightning fast",
    description:
      "Lightweight embed script loads in milliseconds. Zero impact on your page speed.",
    gradient: "from-amber/10 to-amber/5",
  },
  {
    icon: Shield,
    title: "SEO-friendly",
    description:
      "Rich review markup helps search engines see your ratings. Boost your local ranking.",
    gradient: "from-emerald/10 to-emerald/5",
  },
  {
    icon: Palette,
    title: "Fully customizable",
    description:
      "Match your website's design. Control colors, layout, review count, and sorting.",
    gradient: "from-brand/10 to-brand/5",
  },
];

type PublicPlan = {
  id: string;
  name: string;
  priceUsd: number;
  sources: number;
  widgets: number;
  reviews: number;
  views: number | null;
  refreshHours: number;
};

/** Shown until the live plans load, and if the API is unreachable. */
const DEFAULT_PLANS: PublicPlan[] = [
  { id: "FREE", name: "Free", priceUsd: 0, sources: 1, widgets: 1, reviews: 3, views: 200, refreshHours: 48 },
  { id: "PRO", name: "Pro", priceUsd: 5, sources: 3, widgets: 3, reviews: 10, views: null, refreshHours: 24 },
  { id: "BUSINESS", name: "Business", priceUsd: 10, sources: 8, widgets: 8, reviews: 50, views: null, refreshHours: 12 },
];

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

function toCard(p: PublicPlan, index: number, count: number) {
  const free = p.priceUsd <= 0;
  return {
    name: p.name,
    price: `$${Number.isInteger(p.priceUsd) ? p.priceUsd : p.priceUsd.toFixed(2)}`,
    period: free ? "forever" : "/month",
    features: [
      plural(p.widgets, "widget"),
      plural(p.sources, "website"),
      `${p.reviews} reviews shown`,
      p.views === null ? "Unlimited views" : `${p.views.toLocaleString()} views/month`,
      `Reviews update every ${p.refreshHours} hours`,
    ],
    cta: free ? "Get started free" : `Choose ${p.name}`,
    href: "/register",
    // The middle plan of three is the one we point people at.
    highlighted: count === 3 ? index === 1 : false,
  };
}

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div>
      <Hero isLoggedIn={!!user} />
      <WidgetPreview />
      <HowItWorks />
      <Features />
      <Pricing isLoggedIn={!!user} />
      <FinalCTA isLoggedIn={!!user} />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Hero
   ═══════════════════════════════════════════════ */
function Hero({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="relative overflow-hidden gradient-hero-landing">
      {/* Animated decorative orbs */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden
      >
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-brand/10 blur-3xl animate-float" />
        <div
          className="absolute bottom-0 -left-20 h-64 w-64 rounded-full bg-indigo/12 blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute top-1/3 right-1/4 h-48 w-48 rounded-full bg-amber/8 blur-2xl animate-float"
          style={{ animationDelay: "4s" }}
        />
        <div
          className="absolute bottom-1/4 left-1/3 h-36 w-36 rounded-full bg-emerald/8 blur-2xl animate-float"
          style={{ animationDelay: "3s" }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-32">
        {/* Pill badge */}
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-light backdrop-blur-sm animate-fade-in-up">
          <Star className="h-3.5 w-3.5 star-gold" />
          Google Review Widgets for Your Website
        </p>

        <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight text-white md:text-6xl lg:text-7xl animate-fade-in-up delay-100">
          Showcase your{" "}
          <span className="gradient-brand-text">Google Reviews</span>{" "}
          everywhere.
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-dark-text animate-fade-in-up delay-200">
          Embed a beautiful, auto-updating review widget on your website in
          under 2 minutes. Build trust, boost SEO, and convert more visitors
          into customers.
        </p>

        {/* CTA buttons */}
        <div className="mt-10 flex flex-wrap gap-4 animate-fade-in-up delay-300">
          <Link
            href={isLoggedIn ? "/dashboard" : "/register"}
            className="group inline-flex items-center gap-2 rounded-full gradient-brand px-7 py-3.5 text-sm font-bold text-white shadow-glow transition-all duration-300 hover:shadow-[0_0_32px_rgba(232,68,109,0.4)] hover:scale-[1.02]"
          >
            {isLoggedIn ? (
              <>
                <LayoutDashboard className="h-4 w-4" />
                Go to Dashboard
              </>
            ) : (
              <>
                Get started free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Link>
          <a
            href="#preview"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-white/25"
          >
            See it in action
          </a>
        </div>

        {/* Trust stats */}
        <dl className="mt-14 flex flex-wrap gap-x-12 gap-y-6 pb-4 animate-fade-in-up delay-500">
          <HeroStat value="30 sec" label="to embed" />
          <HeroStat value="Auto-sync" label="new reviews" />
          <HeroStat value="Free plan" label="no card needed" />
        </dl>
      </div>
    </section>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-dark-muted">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-black text-white">{value}</dd>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Widget Preview
   ═══════════════════════════════════════════════ */
function WidgetPreview() {
  return (
    <section id="preview" className="relative gradient-mesh">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="text-center animate-fade-in-up">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
            <Sparkles className="h-3.5 w-3.5" />
            Live Preview
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
            This is what your visitors see
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted">
            A real-time, responsive widget that blends naturally with your
            site&apos;s design. Here&apos;s a preview with sample data.
          </p>
        </div>

        {/* Widget preview card */}
        <div className="mx-auto mt-12 max-w-3xl widget-preview-card rounded-3xl p-6 md:p-8 animate-fade-in-up delay-200">
          {/* Widget header */}
          <div className="flex items-center gap-3 flex-wrap mb-5">
            <span className="text-3xl font-black tracking-tight text-ink">
              4.8
            </span>
            <div className="flex gap-0.5 star-gold text-lg">
              {"★★★★★".split("").map((s, i) => (
                <span key={i} className={i === 4 ? "opacity-40" : ""}>
                  {s}
                </span>
              ))}
            </div>
            <span className="text-sm text-muted">127 reviews on Google</span>
          </div>

          {/* Review cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            {MOCK_REVIEWS.map((review) => (
              <div
                key={review.author}
                className="rounded-2xl border border-line/60 bg-white p-4 transition-shadow hover:shadow-card"
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${review.color} text-xs font-bold text-white`}
                  >
                    {review.initial}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">
                      {review.author}
                    </p>
                    <p className="text-xs text-muted">
                      <span className="star-gold">
                        {"★".repeat(review.rating)}
                        {"☆".repeat(5 - review.rating)}
                      </span>{" "}
                      {review.time}
                    </p>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-ink-soft line-clamp-4">
                  {review.text}
                </p>
              </div>
            ))}
          </div>

          {/* Widget footer */}
          <div className="mt-4 text-center">
            <span className="text-xs font-medium text-indigo cursor-pointer hover:underline">
              See all reviews on Google →
            </span>
          </div>
        </div>

        {/* Embed code teaser */}
        <div className="mx-auto mt-8 max-w-lg text-center animate-fade-in-up delay-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
            Just one line of code
          </p>
          <div className="rounded-xl bg-dark px-5 py-3.5 font-mono text-xs text-dark-text overflow-x-auto">
            <span className="text-brand-light">&lt;script</span>{" "}
            <span className="text-amber">src</span>
            <span className="text-white">=</span>
            <span className="text-emerald">
              &quot;https://your-domain.com/embed/widget.js&quot;
            </span>
            <span className="text-brand-light">&gt;&lt;/script&gt;</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   How It Works
   ═══════════════════════════════════════════════ */
function HowItWorks() {
  return (
    <section className="border-t border-line/60 bg-sand">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="text-center animate-fade-in-up">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo">
            <Zap className="h-3.5 w-3.5" />
            Simple setup
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
            Up and running in 3 steps
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted">
            No developers needed. No complex configuration. Just connect, customize, and embed.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div
              key={step.title}
              className="group relative rounded-3xl border border-line/60 bg-card p-6 shadow-card feature-card animate-fade-in-up"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              {/* Step number badge */}
              <span className="absolute -top-3 -left-1 grid h-7 w-7 place-items-center rounded-full gradient-brand text-xs font-bold text-white shadow-card">
                {index + 1}
              </span>

              <span
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${step.accent}`}
              >
                <step.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   Features
   ═══════════════════════════════════════════════ */
function Features() {
  return (
    <section className="border-t border-line/60 gradient-mesh">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="text-center animate-fade-in-up">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald">
            <Shield className="h-3.5 w-3.5" />
            Why My Social Items
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
            Everything you need, nothing you don&apos;t
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((feature, index) => (
            <div
              key={feature.title}
              className="group rounded-3xl border border-line/60 bg-card p-6 shadow-card feature-card animate-fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <span
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient}`}
              >
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   Pricing
   ═══════════════════════════════════════════════ */
function Pricing({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [live, setLive] = useState<PublicPlan[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<PublicPlan[]>("/billing/plans")
      .then((rows) => {
        if (!cancelled && Array.isArray(rows) && rows.length) setLive(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const source = live ?? DEFAULT_PLANS;
  const PLANS = source.map((p, i) => toCard(p, i, source.length));

  return (
    <section id="pricing" className="border-t border-line/60 bg-sand">
      <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <div className="text-center animate-fade-in-up">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-dark">
            <Star className="h-3.5 w-3.5" />
            Pricing
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
            Start free, scale as you grow
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted">
            No credit card required. Upgrade or cancel any time.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative rounded-3xl border p-6 transition-all duration-300 feature-card animate-fade-in-up ${
                plan.highlighted
                  ? "border-brand/40 bg-card shadow-panel ring-1 ring-brand/20"
                  : "border-line/60 bg-card shadow-card"
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-brand px-4 py-1 text-xs font-bold text-white shadow-card">
                  Most popular
                </span>
              )}

              <h3 className="text-lg font-bold">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tight">
                  {plan.price}
                </span>
                <span className="text-sm text-muted">{plan.period}</span>
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-ink-soft"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-wash text-emerald">
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={isLoggedIn ? "/dashboard/billing" : plan.href}
                className={`mt-8 block w-full rounded-full py-3 text-center text-sm font-bold transition-all duration-300 ${
                  plan.highlighted
                    ? "gradient-brand text-white shadow-glow hover:shadow-[0_0_32px_rgba(232,68,109,0.35)] hover:scale-[1.02]"
                    : "border border-line bg-sand text-ink hover:border-brand/40 hover:bg-brand-wash hover:text-brand-dark"
                }`}
              >
                {isLoggedIn ? "View plans in Billing" : plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════
   Final CTA
   ═══════════════════════════════════════════════ */
function FinalCTA({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="relative overflow-hidden border-t border-line/60">
      <div className="absolute inset-0 gradient-hero-landing" aria-hidden />
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-brand/6 blur-3xl animate-glow-pulse" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-20 md:py-28 text-center">
        <div className="animate-fade-in-up">
          <h2 className="text-3xl font-black tracking-tight text-white md:text-5xl">
            Ready to boost your{" "}
            <span className="gradient-brand-text">credibility</span>?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg text-dark-text">
            Join businesses that display real Google reviews to build trust and
            win more customers.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href={isLoggedIn ? "/dashboard" : "/register"}
              className="group inline-flex items-center gap-2 rounded-full gradient-brand px-8 py-4 text-sm font-bold text-white shadow-glow transition-all duration-300 hover:shadow-[0_0_32px_rgba(232,68,109,0.4)] hover:scale-[1.02]"
            >
              {isLoggedIn ? (
                <>
                  <LayoutDashboard className="h-4 w-4" />
                  Go to Dashboard
                </>
              ) : (
                <>
                  Create your free widget
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Link>
          </div>

          <p className="mt-6 text-xs text-dark-muted">
            Free forever plan · No credit card · Setup in 30 seconds
          </p>
        </div>
      </div>
    </section>
  );
}
