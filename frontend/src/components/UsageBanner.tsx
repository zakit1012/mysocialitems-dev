"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// The API sends a huge number for "no limit"; same cut-off as the billing page.
const UNLIMITED = 1_000_000;

type Overview = {
  plan: { id: string; name: string; views: number };
  usage: { period: string; views: number };
};

/** "2026-09" -> "1 Oct", the day this month's views start again from zero. */
function resetDate(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Widget views this month against the plan. A free account sees how close it
 * is to its cap, a warning from 80%, and once the cap is hit that its widgets
 * are hidden on its site until the month resets or it upgrades.
 */
export function UsageBanner() {
  const { token } = useAuth();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    if (!token) return;
    api<Overview>("/billing", { token })
      .then(setData)
      .catch(() => undefined);
  }, [token]);

  if (!data || data.plan.id === "ADMIN") return null;

  const { plan, usage } = data;
  const unlimited = plan.views >= UNLIMITED;

  if (unlimited) {
    return (
      <p className="mt-6 flex items-center gap-2 rounded-2xl border border-line/60 bg-card px-4 py-3 text-sm shadow-card">
        <Eye className="h-4 w-4 text-brand" />
        <span>
          Your widgets were seen <b>{usage.views.toLocaleString()}</b> times this month
          <span className="text-muted"> · unlimited on {plan.name} · </span>
          <Link href="/dashboard/analytics" className="font-medium text-brand hover:underline">
            See analytics
          </Link>
        </span>
      </p>
    );
  }

  // Loads past the cap are counted but never shown, so the number stops at the cap.
  const shown = Math.min(usage.views, plan.views);
  const pct = Math.min(100, Math.round((shown / Math.max(plan.views, 1)) * 100));
  const reached = usage.views >= plan.views;
  const warn = !reached && pct >= 80;

  return (
    <section
      className={`mt-6 rounded-2xl border px-4 py-4 shadow-card ${
        reached ? "border-coral/40 bg-coral/5" : warn ? "border-amber/40 bg-amber-wash" : "border-line/60 bg-card"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {reached || warn ? (
            <TriangleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${reached ? "text-coral" : "text-amber-dark"}`} />
          ) : (
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          )}
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {reached
                ? `${plan.name} limit reached: your widgets are hidden on your website`
                : `Widget views this month: ${shown.toLocaleString()} / ${plan.views.toLocaleString()}`}
            </p>
            <p className="mt-0.5 text-muted">
              {reached
                ? `All ${plan.views.toLocaleString()} free views are used. They come back on ${resetDate(usage.period)}, or upgrade to show them again right away.`
                : warn
                  ? `At ${plan.views.toLocaleString()} views your widgets stop showing on your website until ${resetDate(usage.period)}.`
                  : `The ${plan.name} plan includes ${plan.views.toLocaleString()} views a month. Paid plans are unlimited.`}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/billing"
          className={`inline-flex h-9 shrink-0 items-center rounded-xl px-4 text-sm font-semibold transition ${
            reached || warn
              ? "gradient-brand text-white hover:shadow-glow"
              : "border border-line text-ink hover:border-brand/30 hover:bg-sand"
          }`}
        >
          {reached ? "Upgrade now" : "Get unlimited views"}
        </Link>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand-deep">
        <div
          className={`h-full rounded-full ${reached ? "bg-coral" : warn ? "bg-amber-500" : "gradient-brand"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
}
