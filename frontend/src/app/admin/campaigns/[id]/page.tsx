"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, OctagonX, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader } from "@/components/Loader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminTable } from "../../_components/AdminTable";
import { EmailPreview, StatusBadge, type EmailFields } from "../_ui";
import { duration, fmt, openRate, when, type Counts, type Delivery } from "../_lib";

type Detail = {
  campaign: {
    id: string;
    name: string;
    subject: string;
    preheader: string;
    heading: string;
    content: string;
    status: string;
    sentBy: string | null;
    lastError: string | null;
    createdAt: string;
    finishedAt: string | null;
  };
  counts: Counts;
  perMinute: number;
  mailReady: boolean;
  deliveries: { total: number; page: number; pageSize: number; rows: Delivery[] };
};

const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "opened", label: "Opened" },
  { key: "not-opened", label: "Not opened" },
  { key: "waiting", label: "Waiting" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Not sent" },
];

const STATUS: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: "Waiting", tone: "text-muted" },
  SENDING: { label: "Sending", tone: "text-brand" },
  SENT: { label: "Sent", tone: "text-emerald-dark" },
  FAILED: { label: "Failed", tone: "text-coral" },
  BOUNCED: { label: "Bounced", tone: "text-coral" },
  SKIPPED: { label: "Not sent", tone: "text-amber-dark" },
};

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [reload, setReload] = useState(0);
  const [showEmail, setShowEmail] = useState(false);

  const sending = data?.campaign.status === "SENDING";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () =>
      api<Detail>(`/admin/mailing/campaigns/${id}?filter=${filter}&page=${page}`, { token })
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError("");
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the campaign");
        });
    void load();
    // Live while it sends: progress, who got it, who opened it.
    const timer = sending ? setInterval(load, 3000) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [token, id, filter, page, reload, sending]);

  const email = useMemo<EmailFields | null>(
    () =>
      data
        ? {
            subject: data.campaign.subject,
            preheader: data.campaign.preheader,
            heading: data.campaign.heading,
            content: data.campaign.content,
          }
        : null,
    // The copy that was sent never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.campaign.id],
  );

  if (!data) return error ? <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p> : <Loader label="Loading campaign" />;

  const { campaign, counts } = data;
  const processed = counts.total - counts.queued;
  const pct = counts.total ? Math.floor((processed / counts.total) * 100) : 0;
  const pages = Math.max(1, Math.ceil(data.deliveries.total / data.deliveries.pageSize));

  async function stop() {
    setStopping(false);
    try {
      await api(`/admin/mailing/campaigns/${id}/stop`, { method: "POST", token });
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop it");
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/admin/campaigns" className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-brand">
        <ChevronLeft className="h-3.5 w-3.5" /> All campaigns
      </Link>

      <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{campaign.name}</h2>
              <StatusBadge status={campaign.status} counts={counts} />
            </div>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              Subject: <span className="text-ink">{campaign.subject}</span>
            </p>
            <p className="mt-0.5 text-xs text-hint">
              Started {when(campaign.createdAt)}
              {campaign.sentBy ? ` by ${campaign.sentBy}` : ""}
              {campaign.finishedAt ? ` · ${campaign.status === "STOPPED" ? "stopped" : "finished"} ${when(campaign.finishedAt)}` : ""}
            </p>
          </div>
          {sending && (
            <button
              type="button"
              onClick={() => setStopping(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-coral/40 bg-card px-3.5 py-2 text-[13px] font-semibold text-coral hover:bg-coral/5"
            >
              <OctagonX className="h-4 w-4" /> Stop sending
            </button>
          )}
        </div>

        <div className="mt-4">
          <div className="h-2.5 overflow-hidden rounded-full bg-brand-wash">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[13px] text-muted">
            {fmt(processed)} of {fmt(counts.total)} done ({pct}%)
            {sending && counts.queued > 0 && ` · ${fmt(counts.queued)} waiting, ${duration(counts.queued, data.perMinute)} left at ${data.perMinute} a minute`}
          </p>
        </div>

        {sending && campaign.lastError && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber/40 bg-amber-wash px-3 py-2 text-[13px] text-amber-dark">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b>Waiting on the mail server:</b> {campaign.lastError}
            </span>
          </p>
        )}
        {sending && !data.mailReady && (
          <p className="mt-3 rounded-xl border border-amber/40 bg-amber-wash px-3 py-2 text-[13px] text-amber-dark">
            Email is not set up on the server, so this waits until it is.
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Recipients", fmt(counts.total)],
            ["Sent", fmt(counts.sent)],
            ["Opened", `${fmt(counts.opened)} · ${openRate(counts)}`],
            ["Waiting", fmt(counts.queued)],
            ["Failed", fmt(counts.failed + counts.bounced)],
            ["Not sent", fmt(counts.skipped)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line/70 bg-sand/40 px-3 py-2.5">
              <p className="text-xs text-muted">{label}</p>
              <p className="text-lg font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-hint">
          Opens are counted when the email&apos;s images load, so they are a close guess: some mail apps load images without
          anyone reading, others block them.
        </p>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition ${
                filter === f.key ? "border-brand bg-brand-wash text-brand-dark" : "border-line bg-card text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <AdminTable head={["Recipient", "Status", "Sent", "Opened", "Note"]} empty={!data.deliveries.rows.length}>
          {data.deliveries.rows.map((d) => {
            const s = STATUS[d.status] ?? { label: d.status, tone: "" };
            return (
              <tr key={d.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{d.email}</p>
                  {d.name && <p className="text-[12px] text-muted">{d.name}</p>}
                </td>
                <td className={`px-4 py-2.5 font-semibold ${s.tone}`}>{s.label}</td>
                <td className="px-4 py-2.5 text-muted">{when(d.sentAt)}</td>
                <td className="px-4 py-2.5">
                  {d.openedAt ? (
                    <span className="text-emerald-dark">
                      {when(d.openedAt)}
                      {d.opens > 1 && <span className="text-muted"> · {d.opens}×</span>}
                    </span>
                  ) : (
                    <span className="text-hint">-</span>
                  )}
                </td>
                <td className="max-w-[20rem] px-4 py-2.5 text-[12px] text-muted">{d.error ?? ""}</td>
              </tr>
            );
          })}
        </AdminTable>
        <div className="mt-3 flex items-center justify-end gap-1 text-[13px] text-muted">
          <span className="mr-auto">{fmt(data.deliveries.total)} here</span>
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-line bg-card p-1.5 disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 tabular-nums">
            {page} / {pages}
          </span>
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-line bg-card p-1.5 disabled:opacity-40">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section>
        <button type="button" onClick={() => setShowEmail((v) => !v)} className="text-[13px] font-semibold text-brand hover:underline">
          {showEmail ? "Hide the email" : "Show the email that was sent"}
        </button>
        {showEmail && email && <EmailPreview email={email} token={token} className="mt-3" />}
      </section>

      {error && <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-coral">{error}</p>}

      <ConfirmDialog
        open={stopping}
        danger
        title="Stop sending?"
        message={`The ${fmt(counts.queued)} not sent yet will not get it. The ${fmt(counts.sent)} already sent cannot be taken back.`}
        confirmLabel="Stop sending"
        onCancel={() => setStopping(false)}
        onConfirm={() => void stop()}
      />
    </div>
  );
}
