"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { SITE } from "@/lib/site";

/**
 * What a page shows when it breaks while drawing, instead of a blank screen:
 * a calm message, "Try again", and a way back. The error itself goes to the
 * browser console, never onto the page.
 */
export function ErrorScreen({
  error,
  retry,
  back,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  back: { href: string; label: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-wash text-amber-dark" aria-hidden>
        <TriangleAlert className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-black tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-muted">
        This page ran into a problem. Your widgets, plan and payments are safe. Try again, and if it keeps happening,
        write to <a href={`mailto:${SITE.supportEmail}`} className="font-semibold text-brand">{SITE.supportEmail}</a>.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-11 items-center gap-2 rounded-xl gradient-brand px-5 text-sm font-semibold text-white transition hover:shadow-glow"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
        <Link
          href={back.href}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-5 text-sm font-semibold transition hover:border-brand/40 hover:text-brand"
        >
          {back.label}
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-hint">Error code: {error.digest}</p>}
    </div>
  );
}
