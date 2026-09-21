"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Deal } from "@/lib/types";
import { DealCard } from "@/components/DealCard";

export default function FavoritesPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?next=/favorites");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!token) return;
    api<Deal[]>("/favorites", { token }).then(setDeals).catch(() => setDeals([]));
  }, [token]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 animate-fade-in-up">
      <h1 className="text-3xl font-black">Favourites</h1>
      <p className="mt-2 text-muted">Deals you saved for later.</p>
      {deals.length === 0 ? (
        <p className="mt-8 rounded-4xl border border-dashed border-line bg-card p-12 text-center text-muted">No favourites yet. Heart a deal to keep it here.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}
