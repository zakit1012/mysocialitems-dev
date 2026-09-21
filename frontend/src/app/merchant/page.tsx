"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Deal } from "@/lib/types";
import { money } from "@/lib/format";

export default function MerchantPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login?next=/merchant");
      return;
    }
    if (user.role !== "MERCHANT" && user.role !== "ADMIN") {
      router.push("/");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!token) return;
    api<Deal[]>("/deals/mine", { token }).then(setDeals).catch(() => setDeals([]));
  }, [token]);

  async function remove(id: string) {
    if (!confirm("Delete this deal?")) return;
    await api(`/deals/${id}`, { method: "DELETE", token });
    setDeals((current) => current.filter((deal) => deal.id !== id));
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 animate-fade-in-up">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Partner deals</h1>
          <p className="mt-1 text-muted">Create and manage what guests can buy.</p>
        </div>
        <Link
          href="/merchant/new"
          className="rounded-full gradient-brand px-5 py-2 font-semibold text-white hover:shadow-glow"
        >
          New deal
        </Link>
      </div>
      <div className="mt-8 space-y-4">
        {deals.length === 0 && (
          <p className="rounded-4xl border border-dashed border-line bg-card p-12 text-center text-muted">No deals yet. Publish your first offer.</p>
        )}
        {deals.map((deal) => (
          <article
            key={deal.id}
            className="flex flex-col gap-4 rounded-4xl border border-line/60 bg-card shadow-card p-4 sm:flex-row sm:items-center"
          >
            <div className="relative h-24 w-full overflow-hidden rounded-2xl sm:w-36">
              <Image src={deal.imageUrl} alt={deal.title} fill className="object-cover" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{deal.title}</p>
              <p className="text-sm text-muted">
                {deal.city} · {deal.stock} left · {deal.soldCount} sold · {money(deal.dealPrice)}
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/merchant/${deal.id}/edit`} className="rounded-full border border-line text-ink hover:border-brand/40 hover:text-brand px-4 py-2">
                Edit
              </Link>
              <button onClick={() => remove(deal.id)} className="rounded-full border border-line text-ink hover:border-brand/40 hover:text-brand px-4 py-2">
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
