"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/** A dashboard page that broke: the menu stays, the page offers a way on. */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} back={{ href: "/dashboard", label: "My widgets" }} />;
}
