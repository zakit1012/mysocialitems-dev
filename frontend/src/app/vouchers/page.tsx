"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Voucher } from "@/lib/types";
import { money } from "@/lib/format";

export default function VouchersPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const isMerchant = user?.role === "MERCHANT" || user?.role === "ADMIN";

  async function load() {
    if (!token) return;
    const data = await api<Voucher[]>("/vouchers", { token });
    setVouchers(data);
  }

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?next=/vouchers");
    }
  }, [loading, user, router]);

  useEffect(() => {
    load().catch(() => setVouchers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function redeem(id: string) {
    await api(`/vouchers/${id}/redeem`, { method: "POST", token });
    await load();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 animate-fade-in-up">
      <h1 className="text-3xl font-black">
        {isMerchant ? "Incoming vouchers" : "My vouchers"}
      </h1>
      <p className="mt-2 text-muted">
        {isMerchant
          ? "Scan or type the code, then mark it redeemed when the guest arrives."
          : "Show this code at the venue. Your voucher stays valid until the deal date."}
      </p>
      <div className="mt-8 space-y-4">
        {vouchers.length === 0 && (
          <p className="rounded-4xl border border-dashed border-line bg-card p-12 text-center text-muted">No vouchers yet.</p>
        )}
        {vouchers.map((voucher) => (
          <article
            key={voucher.id}
            className="flex flex-col gap-4 rounded-4xl border border-line/60 bg-card shadow-card p-4 sm:flex-row sm:items-center"
          >
            <div className="relative h-28 w-full overflow-hidden rounded-2xl sm:w-40">
              <Image
                src={voucher.deal.imageUrl}
                alt={voucher.deal.title}
                fill
                className="object-cover"
              />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{voucher.deal.title}</p>
              <p className="text-sm text-muted">{voucher.deal.city}</p>
              <p className="mt-2 font-mono text-2xl tracking-widest gradient-brand-text">
                {voucher.code}
              </p>
              <p className="text-sm text-muted">
                {voucher.quantity} × {money(voucher.totalPaid / voucher.quantity)} ·{" "}
                {voucher.status}
                {voucher.user ? ` · ${voucher.user.name}` : ""}
              </p>
            </div>
            {isMerchant && voucher.status === "ACTIVE" && (
              <button
                onClick={() => redeem(voucher.id)}
                className="rounded-full gradient-brand px-4 py-2 text-white transition hover:bg-brand-dark hover:shadow-glow"
              >
                Redeem
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
