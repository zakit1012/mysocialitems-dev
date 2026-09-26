"use client";

import { useAuth } from "@/lib/auth";
import { AdminCard } from "../_components/AdminTable";
import { HiddenReviewsTab } from "../_components/HiddenReviewsTab";

export default function Page() {
  const { token } = useAuth();
  return (
    <AdminCard>
      <HiddenReviewsTab token={token} />
    </AdminCard>
  );
}
