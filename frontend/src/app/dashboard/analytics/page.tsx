"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader } from "@/components/Loader";

// The API sends a huge number for "no limit"; same cut-off as the billing page.
const UNLIMITED = 1_000_000;
const RANGES = [7, 30, 90] as const;

type Counts = { views: number; loads: number; clicks: number; missed: number };

type Analytics = {
  days: number;
  plan: { name: string; views: number };
  month: { period: string; views: number };
  totals: Counts;
  daily: (Counts & { day: string })[];
  widgets: (Counts & { id: string; name: string })[];
  domains: { domain: string; hits: number; lastSeen: string | null }[];
};

const fmt = (n: number) => n.toLocaleString();

/** "2026-09-26" -> "26 Sep" */
const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/** A round step (1, 2 or 5 x 10^n) that splits `max` into about four ticks. */
function niceStep(max: number) {
  const raw = Math.max(max, 4) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api<Analytics>(`/analytics?days=${days}`, { token })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load analytics");
      });
    return () => {
      cancelled = true;
    };
  }, [token, days]);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Analytics</h1>
          <p className="mt-1 text-muted">How often your widgets are seen and clicked.</p>
        </div>
        <div className="flex rounded-xl border border-line bg-card p-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                days === r ? "bg-brand-wash text-brand" : "text-muted hover:text-ink"
              }`}
            >
              {r} days
            </button>
          ))}
        </div>
      </header>

      {error && <p className="mt-6 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>}

      {!data ? (
        !error && (
          <Loader label="Loading analytics" />
        )
      ) : (
        <Report data={data} />
      )}
    </div>
  );
}

function Report({ data }: { data: Analytics }) {
  const { plan, month, totals } = data;
  const limited = plan.views < UNLIMITED;
  // Loads past the cap are counted but never shown, so the number stops at the cap.
  const monthShown = limited ? Math.min(month.views, plan.views) : month.views;
  const pct = limited ? Math.min(100, Math.round((monthShown / Math.max(plan.views, 1)) * 100)) : 0;
  const clickRate = totals.views ? Math.round((totals.clicks / totals.views) * 1000) / 10 : 0;

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Views this month">
          <p className="text-2xl font-bold">
            {fmt(monthShown)}
            <span className="text-base font-medium text-muted">
              {limited ? ` of ${fmt(plan.views)}` : " · unlimited"}
            </span>
          </p>
          {limited && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-wash">
              <div
                className={`h-full rounded-full ${pct >= 100 ? "bg-coral" : pct >= 80 ? "bg-amber" : "bg-brand"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </Tile>
        <Tile label={`Views, last ${data.days} days`} hint="One per visitor every 30 minutes">
          <p className="text-2xl font-bold">{fmt(totals.views)}</p>
        </Tile>
        <Tile label="Times shown" hint="Every load, reloads included">
          <p className="text-2xl font-bold">{fmt(totals.loads)}</p>
        </Tile>
        <Tile label="Button clicks" hint="“Write a review” and “See all reviews”">
          <p className="text-2xl font-bold">
            {fmt(totals.clicks)}
            {totals.views > 0 && <span className="text-base font-medium text-muted"> · {clickRate}% of views</span>}
          </p>
        </Tile>
      </div>

      {totals.missed > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/40 bg-coral/5 px-4 py-3 text-sm">
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
            <span>
              <b>{fmt(totals.missed)} visitors</b> did not see your widget in the last {data.days} days because
              the {plan.name} plan&apos;s monthly views ran out.
            </span>
          </p>
          <Link
            href="/dashboard/billing"
            className="inline-flex h-9 items-center rounded-xl gradient-brand px-4 font-semibold text-white transition hover:shadow-glow"
          >
            Get unlimited views
          </Link>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-line/60 bg-card p-5 shadow-card">
        <h2 className="font-semibold">Views per day</h2>
        <p className="text-sm text-muted">Last {data.days} days, all widgets. Hover a day for details.</p>
        <DailyChart daily={data.daily} />
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted hover:text-ink">Show as a table</summary>
          <div className="mt-3 max-h-72 overflow-auto">
            <Table
              head={["Day", "Views", "Times shown", "Clicks", "Missed"]}
              rows={[...data.daily].reverse().map((d) => [shortDay(d.day), d.views, d.loads, d.clicks, d.missed])}
            />
          </div>
        </details>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line/60 bg-card p-5 shadow-card">
          <h2 className="font-semibold">By widget</h2>
          <p className="text-sm text-muted">Last {data.days} days</p>
          <div className="mt-3 overflow-x-auto">
            {data.widgets.length ? (
              <Table
                head={["Widget", "Views", "Times shown", "Clicks", "Missed"]}
                rows={data.widgets.map((w) => [w.name, w.views, w.loads, w.clicks, w.missed])}
              />
            ) : (
              <p className="text-sm text-muted">No widgets yet.</p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-line/60 bg-card p-5 shadow-card">
          <h2 className="font-semibold">By website</h2>
          <p className="text-sm text-muted">All time, from your allowed domains</p>
          <div className="mt-3 overflow-x-auto">
            {data.domains.length ? (
              <Table
                head={["Website", "Times shown", "Last seen"]}
                rows={data.domains.map((d) => [
                  d.domain,
                  d.hits,
                  d.lastSeen ? new Date(d.lastSeen).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "Never",
                ])}
              />
            ) : (
              <p className="text-sm text-muted">
                No websites yet. Add one under <Link href="/dashboard/sources" className="text-brand">Sources</Link>.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Tile({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line/60 bg-card p-4 shadow-card">
      <p className="text-[13px] text-muted">{label}</p>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-hint">{hint}</p>}
    </div>
  );
}

/** One column per day. Each column's full height is its hover and focus target. */
function DailyChart({ daily }: { daily: Analytics["daily"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...daily.map((d) => d.views), 0);
  const step = niceStep(max);
  const top = Math.max(step * Math.ceil(max / step), step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelAt = new Set([0, Math.floor((daily.length - 1) / 2), daily.length - 1]);
  const hovered = active === null ? null : daily[active];

  return (
    <div className="mt-7 flex gap-2">
      {/* y axis */}
      <div className="relative h-48 w-8 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
            {fmt(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-48">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-line" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-0.5" onMouseLeave={() => setActive(null)}>
            {daily.map((d, i) => (
              <div
                key={d.day}
                tabIndex={0}
                aria-label={`${shortDay(d.day)}: ${d.views} views`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center outline-none"
              >
                <div
                  className={`w-full max-w-6 rounded-t-[4px] transition-opacity ${
                    active === null || active === i ? "bg-brand" : "bg-brand opacity-40"
                  }`}
                  style={{ height: d.views ? `max(2px, ${(d.views / top) * 100}%)` : 0 }}
                />
              </div>
            ))}
          </div>
          {hovered && active !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-40 rounded-xl border border-line bg-card p-3 text-xs shadow-panel"
              style={
                active < daily.length / 2
                  ? { left: `${((active + 1) / daily.length) * 100}%` }
                  : { right: `${((daily.length - active) / daily.length) * 100}%` }
              }
            >
              <p className="font-semibold text-ink">{shortDay(hovered.day)}</p>
              <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-muted">
                <dt>Views</dt>
                <dd className="text-right font-semibold tabular-nums text-ink">{fmt(hovered.views)}</dd>
                <dt>Times shown</dt>
                <dd className="text-right tabular-nums">{fmt(hovered.loads)}</dd>
                <dt>Clicks</dt>
                <dd className="text-right tabular-nums">{fmt(hovered.clicks)}</dd>
                {hovered.missed > 0 && (
                  <>
                    <dt>Missed</dt>
                    <dd className="text-right tabular-nums">{fmt(hovered.missed)}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>
        {/* x axis: first, middle and last day */}
        <div className="relative mt-2 h-4 text-[11px] text-muted">
          {daily.map((d, i) =>
            labelAt.has(i) ? (
              <span
                key={d.day}
                className={`absolute whitespace-nowrap ${
                  i === 0 ? "left-0" : i === daily.length - 1 ? "right-0" : "-translate-x-1/2"
                }`}
                style={i !== 0 && i !== daily.length - 1 ? { left: `${((i + 0.5) / daily.length) * 100}%` } : undefined}
              >
                {shortDay(d.day)}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-muted">
          {head.map((h, i) => (
            <th key={h} className={`py-2 font-medium ${i ? "pl-3 text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} className="border-b border-line/60 last:border-0">
            {row.map((cell, i) => (
              <td key={i} className={`py-2 ${i ? "pl-3 text-right tabular-nums" : "max-w-[14rem] truncate font-medium"}`}>
                {typeof cell === "number" ? fmt(cell) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
