"use client";

import { useAuth } from "@/lib/auth";
import { AdminCard } from "../_components/AdminTable";
import { PlansTab } from "../_components/PlansTab";

export default function Page() {
  const { token } = useAuth();
  return (
    <AdminCard>
      <PlansTab token={token} />
    </AdminCard>
  );
}
