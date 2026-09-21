"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { DealForm } from "@/components/DealForm";

export default function NewDealPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/login?next=/merchant/new");
    else if (user.role !== "MERCHANT" && user.role !== "ADMIN") router.push("/");
  }, [loading, user, router]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 animate-fade-in-up">
      <h1 className="mb-6 text-3xl font-black">Create a deal</h1>
      <DealForm />
    </div>
  );
}
