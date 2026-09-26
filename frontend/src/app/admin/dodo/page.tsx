"use client";

import { useAuth } from "@/lib/auth";
import { AdminCard } from "../_components/AdminTable";
import { DodoTab } from "../_components/DodoTab";

export default function Page() {
  const { token } = useAuth();
  return (
    <AdminCard>
      <DodoTab token={token} />
    </AdminCard>
  );
}
