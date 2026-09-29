"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/** An admin page that broke: the menu stays, the page offers a way on. */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} back={{ href: "/admin", label: "Admin overview" }} />;
}
