import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/Logo";
import { appHref, siteHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * Any address that matches no page, on every host. It stands on its own
 * (no site header or dashboard menu), so it looks the same whichever part
 * of the app the link pointed into.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <Link href={siteHref("/")} className="flex items-center gap-2.5" aria-label="WidgetPop home">
        <LogoMark className="h-9 w-9 shadow-glow" />
        <Wordmark className="text-lg" />
      </Link>
      <p className="gradient-brand-text mt-12 text-7xl font-black tracking-tight">404</p>
      <h1 className="mt-3 text-2xl font-black tracking-tight">This page doesn&apos;t exist</h1>
      <p className="mt-2 max-w-sm text-muted">The link may be old or mistyped. These will get you back on track:</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href={siteHref("/")}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-5 text-sm font-semibold transition hover:border-brand/40 hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" /> Home page
        </Link>
        <Link
          href={appHref("/dashboard")}
          className="inline-flex h-11 items-center gap-2 rounded-xl gradient-brand px-5 text-sm font-semibold text-white transition hover:shadow-glow"
        >
          <LayoutGrid className="h-4 w-4" /> Your widgets
        </Link>
      </div>
    </main>
  );
}
