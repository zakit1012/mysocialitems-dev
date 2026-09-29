"use client";

import { ErrorScreen } from "@/components/ErrorScreen";
import { siteHref } from "@/lib/site";

/** A page that broke anywhere outside the dashboard and admin panel. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} back={{ href: siteHref("/"), label: "Home page" }} />;
}
