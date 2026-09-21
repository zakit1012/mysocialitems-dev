"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DealForm } from "@/components/DealForm";
import type { Deal } from "@/lib/types";

export default function EditDealPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/login");
    else if (user.role !== "MERCHANT" && user.role !== "ADMIN") router.push("/");
  }, [loading, user, router]);

  useEffect(() => {
    if (!token) return;
    api<Deal>(`/deals/${id}`, { token }).then(setDeal);
  }, [id, token]);

  if (!deal) return <p className="px-4 py-20 text-center">Loading deal...</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 animate-fade-in-up">
      <h1 className="mb-6 text-3xl font-black">Edit deal</h1>
      <DealForm deal={deal} />
    </div>
  );
}
