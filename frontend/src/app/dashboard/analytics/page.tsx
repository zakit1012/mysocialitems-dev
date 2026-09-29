"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Eye, MousePointerClick, QrCode, TriangleAlert } from "lucide-react";
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
  totals: Counts & { opens: number };
  /** The same number of days just before the range. */
  previous: Counts & { opens: number };
  daily: (Counts & { day: string; opens: number })[];
  widgets: (Counts & { id: string; name: string })[];
  domains: { domain: string; hits: number; lastSeen: string | null }[];
  /** Each business's review link and QR code: opens in the range and ever. */
  reviewLinks: { id: string; name: string; opens: number; total: number }[];
};

/** What the chart can show, each in its own colour. */
const METRICS = [
  { key: "views", label: "Views", bar: "bg-brand" },
  { key: "clicks", label: "Button clicks", bar: "bg-indigo" },
  { key: "opens", label: "Review link opens", bar: "bg-emerald" },
] as const;
type Metric = (typeof METRICS)[number]["key"];

const fmt = (n: number) => n.toLocaleString();

/** "2026-09-26" -> "26 Sep" */
const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/** Clicks per 100 views, one decimal. */
const rate = (clicks: number, views: number) => (views ? `${Math.round((clicks / views) * 1000) / 10}%` : "-");

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
          <p className="mt-1 text-muted">How often your widgets are seen and clicked, and your review link opened.</p>
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
  const { plan, month, totals, previous } = data;
  const [metric, setMetric] = useState<Metric>("views");
  const limited = plan.views < UNLIMITED;
  // Loads past the cap are counted but never shown, so the number stops at the cap.
  const monthShown = limited ? Math.min(month.views, plan.views) : month.views;
  const pct = limited ? Math.min(100, Math.round((monthShown / Math.max(plan.views, 1)) * 100)) : 0;
  const shown = METRICS.find((m) => m.key === metric)!;

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={<CalendarDays className="h-4 w-4" />} label="Views this month">
          <p className="text-2xl font-bold tabular-nums">
            {fmt(monthShown)}
            <span className="text-base font-medium text-muted">
              {limited ? ` of ${fmt(plan.views)}` : " · unlimited"}
            </span>
          </p>
          {limited ? (
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-brand-wash">
              <div
                className={`h-full rounded-full ${pct >= 100 ? "bg-coral" : pct >= 80 ? "bg-amber" : "bg-brand"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : (
            <p className="mt-1 text-xs text-hint">On the {plan.name} plan</p>
          )}
        </Tile>
        <Tile icon={<Eye className="h-4 w-4" />} label="Views" hint="Once per visitor every 30 minutes">
          <Figure value={totals.views} before={previous.views} days={data.days} />
        </Tile>
        <Tile icon={<MousePointerClick className="h-4 w-4" />} label="Button clicks" hint={`${rate(totals.clicks, totals.views)} of views clicked “Write a review” or “See all”`}>
          <Figure value={totals.clicks} before={previous.clicks} days={data.days} />
        </Tile>
        <Tile icon={<QrCode className="h-4 w-4" />} label="Review link opens" hint="Your review link opened or its QR code scanned">
          <Figure value={totals.opens} before={previous.opens} days={data.days} />
        </Tile>
      </div>

      {totals.missed > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/40 bg-coral/5 px-4 py-3 text-sm">
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
            <span>
              Your widget was not shown <b>{fmt(totals.missed)} times</b> in the last {data.days} days because
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{shown.label} per day</h2>
            <p className="text-sm text-muted">
              Last {data.days} days, {metric === "opens" ? "all review links and QR codes" : "all widgets"}. Hover a day
              for details.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="What the chart shows">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={metric === m.key}
                onClick={() => setMetric(m.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition ${
                  metric === m.key ? "border-ink/10 bg-sand text-ink" : "border-line text-muted hover:text-ink"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${m.bar}`} aria-hidden />
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <DailyChart daily={data.daily} metric={metric} bar={shown.bar} />
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted hover:text-ink">Show as a table</summary>
          <div className="mt-3 max-h-72 overflow-auto">
            <Table
              head={["Day", "Views", "Clicks", "Link opens", "Missed"]}
              rows={[...data.daily].reverse().map((d) => [shortDay(d.day), d.views, d.clicks, d.opens, d.missed])}
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
                head={["Widget", "Views", "Clicks", "Click rate"]}
                rows={data.widgets.map((w) => [w.name, w.views, w.clicks, rate(w.clicks, w.views)])}
              />
            ) : (
              <p className="text-sm text-muted">No widgets yet.</p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-line/60 bg-card p-5 shadow-card">
          <h2 className="font-semibold">Review link and QR code</h2>
          <p className="text-sm text-muted">Opens in the last {data.days} days, and ever</p>
          <div className="mt-3 overflow-x-auto">
            {data.reviewLinks.length ? (
              <Table
                head={["Business", "Opens", "All time"]}
                rows={data.reviewLinks.map((b) => [b.name, b.opens, b.total])}
              />
            ) : (
              <p className="text-sm text-muted">
                Share a review link or print a QR poster from{" "}
                <Link href="/dashboard/get-reviews" className="text-brand">
                  Get reviews
                </Link>
                , and see here how often customers open it.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-line/60 bg-card p-5 shadow-card lg:col-span-2">
          <h2 className="font-semibold">By website</h2>
          <p className="text-sm text-muted">All time, from your allowed domains</p>
          <div className="mt-3 overflow-x-auto">
            {data.domains.length ? (
              <Table
                head={["Website", "Views", "Last seen"]}
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

function Tile({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line/60 bg-card p-4 shadow-card">
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-wash text-brand" aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1 text-xs text-hint">{hint}</p>}
    </div>
  );
}

/** A count and how it moved against the same number of days before. */
function Figure({ value, before, days }: { value: number; before: number; days: number }) {
  const change = before ? Math.round(((value - before) / before) * 100) : null;
  const versus = `than the ${days} days before`;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-2xl font-bold tabular-nums">
      {fmt(value)}
      {change !== null && change !== 0 ? (
        <span
          className={`inline-flex items-center gap-0.5 text-[12.5px] font-semibold ${change > 0 ? "text-emerald-dark" : "text-muted"}`}
          title={`${fmt(before)} ${versus}`}
        >
          {change > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(change)}%
          <span className="sr-only"> {change > 0 ? "more" : "fewer"} {versus}</span>
        </span>
      ) : !before && value ? (
        <span className="text-[12.5px] font-semibold text-emerald-dark" title={`None ${versus}`}>
          New
        </span>
      ) : null}
    </p>
  );
}

/** One column per day. Each column's full height is its hover and focus target. */
function DailyChart({ daily, metric, bar }: { daily: Analytics["daily"]; metric: Metric; bar: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...daily.map((d) => d[metric]), 0);
  const step = niceStep(max);
  const top = Math.max(step * Math.ceil(max / step), step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelAt = new Set([0, Math.floor((daily.length - 1) / 2), daily.length - 1]);
  const hovered = active === null ? null : daily[active];

  return (
    <div className="mt-7 flex gap-2">
      {/* y axis */}
      <div className="relative h-52 w-8 shrink-0 text-right text-[11px] tabular-nums text-muted">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
            {fmt(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-52">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-line" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-0.5" onMouseLeave={() => setActive(null)}>
            {daily.map((d, i) => (
              <div
                key={d.day}
                tabIndex={0}
                aria-label={`${shortDay(d.day)}: ${d.views} views, ${d.clicks} clicks, ${d.opens} review link opens`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center outline-none"
              >
                <div
                  className={`w-full max-w-6 rounded-t-[4px] transition-[opacity,height] ${bar} ${
                    active === null || active === i ? "" : "opacity-40"
                  }`}
                  style={{ height: d[metric] ? `max(2px, ${(d[metric] / top) * 100}%)` : 0 }}
                />
              </div>
            ))}
          </div>
          {hovered && active !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-48 rounded-xl border border-line bg-card p-3 text-xs shadow-panel"
              style={
                active < daily.length / 2
                  ? { left: `${((active + 1) / daily.length) * 100}%` }
                  : { right: `${((daily.length - active) / daily.length) * 100}%` }
              }
            >
              <p className="font-semibold text-ink">{shortDay(hovered.day)}</p>
              <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-muted">
                {METRICS.map((m) => (
                  <Row key={m.key} label={m.label} value={hovered[m.key]} dot={m.bar} strong={m.key === metric} />
                ))}
                {hovered.missed > 0 && <Row label="Missed" value={hovered.missed} />}
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

function Row({ label, value, dot, strong }: { label: string; value: number; dot?: string; strong?: boolean }) {
  return (
    <>
      <dt className="flex items-center gap-1.5">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />}
        {label}
      </dt>
      <dd className={`text-right tabular-nums ${strong ? "font-semibold text-ink" : ""}`}>{fmt(value)}</dd>
    </>
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
