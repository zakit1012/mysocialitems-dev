"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal, Sparkles, Ticket, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Category, Deal } from "@/lib/types";
import { DealCard } from "@/components/DealCard";

export default function HomePage() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Category[]>("/categories").then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    if (category) params.set("category", category);
    setLoading(true);
    api<{ items: Deal[]; cities: string[] }>(`/deals?${params.toString()}`, {
      token,
    })
      .then((data) => {
        setDeals(data.items);
        setCities(data.cities);
      })
      .catch(() => setDeals([]))
      .finally(() => setLoading(false));
  }, [q, city, category, token]);

  const featured = useMemo(
    () => deals.filter((deal) => deal.featured).slice(0, 4),
    [deals],
  );
  const filtered = Boolean(q || city || category);
  const showFeatured = !filtered && featured.length > 0;

  return (
    <div>
      <Hero />

      <div className="mx-auto max-w-6xl px-4">
        <FilterBar
          cities={cities}
          categories={categories}
          city={city}
          category={category}
          onCity={setCity}
          onCategory={setCategory}
        />
      </div>

      <div className="mx-auto max-w-6xl space-y-12 px-4 pb-16">
        {q && (
          <p className="text-sm text-muted">
            Results for <span className="font-semibold text-ink">&ldquo;{q}&rdquo;</span>
          </p>
        )}

        {showFeatured && (
          <section className="animate-fade-in-up">
            <SectionHead
              icon={<Sparkles className="h-4 w-4" />}
              eyebrow="Handpicked"
              title="Today's picks"
              subtitle="The deals our team would book themselves this week."
              accentColor="text-amber"
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {featured.map((deal) => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </div>
          </section>
        )}

        <section className="animate-fade-in-up delay-200">
          <SectionHead
            icon={<Ticket className="h-4 w-4" />}
            eyebrow={filtered ? "Filtered" : "All deals"}
            title={
              loading
                ? "Finding deals..."
                : `${deals.length} ${deals.length === 1 ? "deal" : "deals"}`
            }
            subtitle={
              filtered
                ? "Matching your search and filters."
                : "Everything live right now."
            }
            accentColor="text-brand"
          />

          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <DealSkeleton key={i} />
              ))}
            </div>
          ) : deals.length === 0 ? (
            <EmptyState
              canReset={Boolean(city || category)}
              onReset={() => {
                setCity("");
                setCategory("");
              }}
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {deals.map((deal) => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─────────── Hero ─────────── */
function Hero() {
  return (
    <section className="relative overflow-hidden gradient-hero">
      {/* Floating decorative orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-brand/10 blur-3xl animate-float" />
        <div
          className="absolute bottom-0 -left-20 h-56 w-56 rounded-full bg-indigo/10 blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute top-1/2 right-1/4 h-40 w-40 rounded-full bg-amber/8 blur-2xl animate-float"
          style={{ animationDelay: "4s" }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-24">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-light backdrop-blur-sm">
          Nearby · discounted · voucher in your pocket
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight text-white md:text-6xl">
          Discover your city at a{" "}
          <span className="gradient-brand-text">My Social Items</span> price.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-dark-text">
          Restaurants, hotels, spas and days out — usually 30–70 % off. Buy a
          voucher, show it at the door, and go.
        </p>

        <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-6 pb-4">
          <HeroStat
            icon={<Wallet className="h-4 w-4" />}
            value="30–70%"
            label="off local favourites"
          />
          <HeroStat
            icon={<Ticket className="h-4 w-4" />}
            value="Instant"
            label="voucher, no printing"
          />
          <HeroStat
            icon={<Sparkles className="h-4 w-4" />}
            value="Handpicked"
            label="by our local team"
          />
        </dl>
      </div>
    </section>
  );
}

function HeroStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-dark-muted">
        <span className="text-brand-light">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-black text-white">{value}</dd>
    </div>
  );
}

/* ─────────── Filter bar ─────────── */
function FilterBar({
  cities,
  categories,
  city,
  category,
  onCity,
  onCategory,
}: {
  cities: string[];
  categories: Category[];
  city: string;
  category: string;
  onCity: (value: string) => void;
  onCategory: (value: string) => void;
}) {
  return (
    <div className="relative -mt-8 z-10 rounded-4xl border border-line/60 bg-card/90 p-5 shadow-panel backdrop-blur-md">
      <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Narrow it down
      </p>

      <FilterRow label="City">
        <FilterChip active={!city} onClick={() => onCity("")} label="All cities" />
        {cities.map((item) => (
          <FilterChip
            key={item}
            active={city === item}
            onClick={() => onCity(item)}
            label={item}
          />
        ))}
      </FilterRow>

      <FilterRow label="Category">
        <FilterChip
          active={!category}
          onClick={() => onCategory("")}
          label="All categories"
        />
        {categories.map((item) => (
          <FilterChip
            key={item.id}
            active={category === item.slug}
            onClick={() => onCategory(item.slug)}
            label={item.name}
          />
        ))}
      </FilterRow>
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-line/60 pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-20 shrink-0 text-sm font-semibold text-ink">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
        active
          ? "gradient-brand text-white shadow-card"
          : "border border-line bg-sand text-ink hover:border-brand/40 hover:bg-brand-wash hover:text-brand-dark"
      }`}
    >
      {label}
    </button>
  );
}

function SectionHead({
  icon,
  eyebrow,
  title,
  subtitle,
  accentColor = "text-brand",
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  accentColor?: string;
}) {
  return (
    <div className="mb-5">
      <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${accentColor}`}>
        {icon}
        {eyebrow}
      </p>
      <h2 className="mt-1.5 text-2xl font-black tracking-tight md:text-3xl">{title}</h2>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
    </div>
  );
}

function DealSkeleton() {
  return (
    <div className="overflow-hidden rounded-4xl border border-line/60 bg-card shadow-card">
      <div className="aspect-[16/10] animate-shimmer" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-24 animate-shimmer rounded-full" />
        <div className="h-4 w-full animate-shimmer rounded-full" />
        <div className="h-4 w-2/3 animate-shimmer rounded-full" />
        <div className="h-6 w-28 animate-shimmer rounded-full" />
      </div>
    </div>
  );
}

function EmptyState({
  onReset,
  canReset,
}: {
  onReset: () => void;
  canReset: boolean;
}) {
  return (
    <div className="rounded-4xl border border-dashed border-line bg-card p-12 text-center animate-fade-in-up">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-wash">
        <Ticket className="h-7 w-7 text-brand" />
      </div>
      <p className="text-lg font-semibold text-ink">No deals match that filter</p>
      <p className="mt-1.5 text-muted">Try another city or category.</p>
      {canReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-6 rounded-full gradient-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:shadow-glow"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
