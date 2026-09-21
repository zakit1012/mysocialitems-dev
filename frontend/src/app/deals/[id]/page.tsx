"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Check, ChevronLeft, Heart, MapPin, ShieldCheck, Star } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Deal } from "@/lib/types";
import { money } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, token } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState({ rating: 5, comment: "" });

  async function load() {
    const data = await api<Deal>(`/deals/${id}`, { token });
    setDeal(data);
  }

  useEffect(() => {
    load().catch(() => setDeal(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  async function buy() {
    if (!user) {
      router.push(`/login?next=/deals/${id}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/vouchers/${deal!.id}`, {
        method: "POST",
        token,
        body: JSON.stringify({ quantity }),
      });
      router.push("/vouchers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not buy voucher");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite() {
    if (!user) {
      router.push(`/login?next=/deals/${id}`);
      return;
    }
    await api(`/favorites/${deal!.id}`, { method: "POST", token });
    await load();
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      router.push(`/login?next=/deals/${id}`);
      return;
    }
    setError("");
    try {
      await api(`/deals/${deal!.id}/reviews`, {
        method: "POST",
        token,
        body: JSON.stringify(review),
      });
      setReview({ rating: 5, comment: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review");
    }
  }

  if (!deal) {
    return <DealSkeleton />;
  }

  const saved = deal.originalPrice - deal.dealPrice;
  const soldOut = deal.stock < 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-brand"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to deals
      </Link>

      <div className="mt-5 grid gap-10 lg:grid-cols-[1.5fr_0.85fr] lg:items-start">
        <div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-5xl shadow-card">
            <Image
              src={deal.imageUrl}
              alt={deal.title}
              fill
              priority
              className="object-cover"
              sizes="(min-width: 1024px) 60vw, 100vw"
            />
            <div className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/30 to-transparent" />
            <span className="absolute left-4 top-4 rounded-full gradient-brand px-3 py-1.5 font-bold text-white shadow-card">
              -{deal.discountPercent}%
            </span>
            {deal.stock > 0 && deal.stock <= 5 && (
              <span className="absolute bottom-4 left-4 rounded-full bg-brand/90 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
                Only {deal.stock} left
              </span>
            )}
          </div>

          <h1 className="mt-7 text-3xl font-black leading-tight md:text-4xl">
            {deal.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-brand">
              <MapPin className="h-4 w-4" />
              {deal.location} · {deal.category.name}
            </span>
            {deal.avgRating > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-ink">
                <Star className="h-4 w-4 fill-amber text-amber" />
                <span className="font-semibold">{deal.avgRating.toFixed(1)}</span>
                <span className="text-muted">({deal.reviewCount} reviews)</span>
              </span>
            ) : (
              <span className="text-muted">No reviews yet</span>
            )}
            <span className="text-muted">{deal.soldCount} vouchers sold</span>
          </div>

          <p className="mt-6 whitespace-pre-wrap leading-7 text-ink-soft">
            {deal.description}
          </p>

          {deal.highlights.length > 0 && (
            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {deal.highlights.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 rounded-2xl border border-line/60 bg-card px-4 py-3 text-sm leading-relaxed"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  {item}
                </li>
              ))}
            </ul>
          )}

          <section className="mt-12">
            <h2 className="text-2xl font-black tracking-tight">
              Reviews
              {deal.reviewCount > 0 && (
                <span className="ml-2 text-base font-semibold text-muted">
                  {deal.reviewCount}
                </span>
              )}
            </h2>

            <div className="mt-5 space-y-3">
              {deal.reviews?.length ? (
                deal.reviews.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-3xl border border-line/60 bg-card p-5 shadow-card"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-wash text-sm font-bold text-brand-dark">
                        {item.user.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.user.name}</p>
                        <Stars value={item.rating} />
                      </div>
                    </div>
                    <p className="mt-3 leading-relaxed text-ink-soft">{item.comment}</p>
                  </article>
                ))
              ) : (
                <p className="rounded-3xl border border-dashed border-line bg-card p-8 text-center text-muted">
                  Be the first to review after you buy.
                </p>
              )}
            </div>

            <form
              onSubmit={submitReview}
              className="mt-6 space-y-4 rounded-4xl border border-line/60 bg-card p-6 shadow-card"
            >
              <p className="font-semibold">Leave a review</p>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">Rating</span>
                <select
                  value={review.rating}
                  onChange={(e) =>
                    setReview((prev) => ({ ...prev, rating: Number(e.target.value) }))
                  }
                  className="w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/12"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} stars
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">Your review</span>
                <textarea
                  required
                  minLength={4}
                  value={review.comment}
                  onChange={(e) =>
                    setReview((prev) => ({ ...prev, comment: e.target.value }))
                  }
                  className="h-28 w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none transition placeholder:text-hint focus:border-brand focus:ring-4 focus:ring-brand/12"
                  placeholder="How was your My Social Items?"
                />
              </label>
              <button className="rounded-full gradient-brand px-5 py-2.5 font-semibold text-white transition hover:bg-brand-dark">
                Publish review
              </button>
            </form>
          </section>
        </div>

        <aside className="rounded-5xl border border-line/60 bg-card p-6 shadow-panel lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            My Social Items price
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <span className="text-4xl font-black text-brand">
              {money(deal.dealPrice)}
            </span>
            <span className="text-lg text-muted line-through">
              {money(deal.originalPrice)}
            </span>
          </div>
          {saved > 0 && (
            <p className="mt-2 inline-block rounded-full bg-emerald-wash px-3 py-1 text-sm font-semibold text-emerald-dark">
              You save {money(saved)}
            </p>
          )}
          <p className="mt-3 text-sm text-muted">Offered by {deal.merchant.name}</p>

          <label className="mt-6 block space-y-1.5">
            <span className="text-sm font-medium text-ink">Vouchers</span>
            <select
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              disabled={soldOut}
              className="w-full rounded-xl border border-line bg-white px-3 py-3 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/12 disabled:bg-sand"
            >
              {Array.from({ length: Math.max(1, Math.min(10, deal.stock)) }, (_, i) => i + 1).map(
                (n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ),
              )}
            </select>
          </label>

          {error && <p className="mt-3 text-sm text-coral">{error}</p>}

          <button
            disabled={busy || soldOut}
            onClick={buy}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full gradient-brand font-semibold text-white transition hover:bg-brand-dark hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Spinner />}
            {soldOut
              ? "Sold out"
              : busy
                ? "Buying..."
                : `Buy for ${money(deal.dealPrice * quantity)}`}
          </button>

          <button
            onClick={toggleFavorite}
            className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line font-medium transition hover:border-coral/40 hover:bg-coral/5"
          >
            <Heart
              className={`h-4 w-4 ${deal.favorited ? "fill-coral text-coral" : ""}`}
            />
            {deal.favorited ? "Saved" : "Save to favourites"}
          </button>

          <p className="mt-5 flex items-start gap-2 border-t border-line/60 pt-4 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            Demo checkout — no real payment is taken. Your voucher appears instantly.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= value ? "fill-amber text-amber" : "text-line"
          }`}
        />
      ))}
    </span>
  );
}

function DealSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-10 lg:grid-cols-[1.5fr_0.85fr]">
        <div>
          <div className="aspect-[16/9] animate-pulse rounded-5xl bg-sand-deep" />
          <div className="mt-7 h-9 w-3/4 animate-pulse rounded-full bg-sand-deep" />
          <div className="mt-4 h-4 w-1/2 animate-pulse rounded-full bg-sand-deep" />
          <div className="mt-8 space-y-3">
            <div className="h-4 w-full animate-pulse rounded-full bg-sand-deep" />
            <div className="h-4 w-full animate-pulse rounded-full bg-sand-deep" />
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-sand-deep" />
          </div>
        </div>
        <div className="h-72 animate-pulse rounded-5xl bg-sand-deep" />
      </div>
    </div>
  );
}
