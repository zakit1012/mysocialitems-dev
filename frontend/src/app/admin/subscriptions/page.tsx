"use client";

import { useAuth } from "@/lib/auth";
import { AdminCard } from "../_components/AdminTable";
import { SubscriptionsTab } from "../_components/SubscriptionsTab";

export default function Page() {
  const { token } = useAuth();
  return (
    <AdminCard>
      <SubscriptionsTab token={token} />
    </AdminCard>
  );
}
