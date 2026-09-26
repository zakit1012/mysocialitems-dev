"use client";

import { useAuth } from "@/lib/auth";
import { AdminCard } from "../_components/AdminTable";
import { PaypalTab } from "../_components/PaypalTab";

export default function Page() {
  const { token } = useAuth();
  return (
    <AdminCard>
      <PaypalTab token={token} />
    </AdminCard>
  );
}
