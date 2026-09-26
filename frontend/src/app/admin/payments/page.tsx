"use client";

import { useAuth } from "@/lib/auth";
import { PaymentsTab } from "../_components/PaymentsTab";

export default function Page() {
  const { token } = useAuth();
  return <PaymentsTab token={token} />;
}
