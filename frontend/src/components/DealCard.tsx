import Image from "next/image";
import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import type { Deal } from "@/lib/types";
import { money } from "@/lib/format";

export function DealCard({ deal }: { deal: Deal }) {
  const saved = deal.originalPrice - deal.dealPrice;
  const almostGone = deal.stock > 0 && deal.stock <= 5;

  return (
    <Link
      href={`/deals/${deal.slug}`}
      className="group flex flex-col overflow-hidden rounded-4xl border border-line/60 bg-card shadow-card transition duration-300 hover:-translate-y-1 hover:border-brand/25 hover:shadow-card-hover"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={deal.imageUrl}
          alt={deal.title}
          fill
          className="object-cover transition duration-500 group-hover:scale-105"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        {/* Keeps the white badges readable over bright photos */}
        <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/25 to-transparent" />

        <span className="absolute left-3 top-3 rounded-full gradient-brand px-2.5 py-1 text-sm font-bold text-white shadow-card">
          -{deal.discountPercent}%
        </span>

        {deal.avgRating > 0 && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-card">
            <Star className="h-3.5 w-3.5 fill-amber text-amber" />
            {deal.avgRating.toFixed(1)}
          </span>
        )}

        {almostGone && (
          <span className="absolute bottom-3 left-3 rounded-full bg-brand/90 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            Only {deal.stock} left
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-brand">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {deal.city} · {deal.category.name}
          </span>
        </p>

        <h3 className="line-clamp-2 min-h-12 text-lg font-semibold leading-snug transition group-hover:text-brand-dark">
          {deal.title}
        </h3>

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-brand">{money(deal.dealPrice)}</span>
            <span className="text-sm text-muted line-through">
              {money(deal.originalPrice)}
            </span>
          </div>
          {saved > 0 && (
            <span className="rounded-full bg-emerald-wash px-2 py-0.5 text-xs font-semibold text-emerald-dark">
              save {money(saved)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
