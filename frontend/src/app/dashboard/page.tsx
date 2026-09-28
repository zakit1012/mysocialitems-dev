"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, MapPin, Plus, Store } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { UsageBanner } from "@/components/UsageBanner";
import { LiveBadge, SetupChecklist } from "@/components/SetupChecklist";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Loader } from "@/components/Loader";

type Widget = {
  id: string;
  publicKey: string;
  placeId: string;
  placeName: string;
  placeAddress?: string | null;
  createdAt: string;
  lastSeenAt?: string | null;
  lastSeenHost?: string | null;
  /** Over the plan's widget limit: the embed does not show it. */
  paused?: boolean;
};

export default function DashboardPage() {
  const { token } = useAuth();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [domains, setDomains] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<Widget[]>("/widgets", { token }),
      api<unknown[]>("/sources", { token }).catch(() => []),
    ])
      .then(([w, s]) => {
        setWidgets(w);
        setDomains(s.length);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load widgets"),
      )
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">My widgets</h1>
          <p className="mt-1 text-muted">
            {loading
              ? "Loading your places..."
              : widgets.length === 0
                ? "Create a widget from a Google Place."
                : `${widgets.length} ${widgets.length === 1 ? "place" : "places"} connected.`}
          </p>
        </div>
        <Link
          href="/dashboard/widgets/new"
          className="inline-flex h-11 items-center gap-2 rounded-xl gradient-brand px-5 font-semibold text-white transition hover:shadow-glow hover:bg-brand-dark"
        >
          <Plus className="h-4 w-4" />
          Create widget
        </Link>
      </header>

      <UsageBanner />
      {!loading && !error && <SetupChecklist widgets={widgets} domains={domains} />}

      {error && (
        <p className="mt-6 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      )}

      <div className="mt-8">
        {loading ? (
          <Loader label="Loading your widgets" />
        ) : widgets.length === 0 && !error ? (
          <EmptyState />
        ) : (
          // grid-cols-1, not the implicit column: that one grows to fit a
          // long place name and pushes the page wider than a phone.
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {widgets.map((widget) => (
              <WidgetCard 
                key={widget.id} 
                widget={widget} 
                onDelete={(id) => setWidgets(w => w.filter(x => x.id !== id))} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetCard({ widget, onDelete }: { widget: Widget; onDelete: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const { token } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState("");

  async function handleDelete() {
    setAsking(false);
    setDeleting(true);
    setFailed("");
    try {
      await api(`/widgets/${widget.id}`, { method: "DELETE", token });
      onDelete(widget.id);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "Could not delete the widget");
      setDeleting(false);
    }
  }

  return (
    <article className="flex min-w-0 flex-col rounded-4xl border border-line/60 bg-card p-5 shadow-card transition-shadow hover:shadow-panel">
      <ConfirmDialog
        open={asking}
        danger
        title={`Delete ${widget.placeName}?`}
        message="The widget disappears from every website it is installed on, and its embed code stops working. This cannot be undone."
        confirmLabel="Delete widget"
        cancelLabel="Keep it"
        onCancel={() => setAsking(false)}
        onConfirm={handleDelete}
      />
      {failed && <p className="mb-3 rounded-lg bg-coral/10 px-3 py-2 text-[13px] text-coral">{failed}</p>}
      {/* The buttons move under the name when both do not fit on one line. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-40 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-wash text-brand">
            <Store className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold" title={widget.placeName}>{widget.placeName}</h2>
            {widget.paused && (
              <p className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-700">
                Paused - over your plan&apos;s widget limit.{" "}
                <Link href="/dashboard/billing" className="underline">
                  Upgrade
                </Link>{" "}
                or delete another widget.
              </p>
            )}
            {widget.placeAddress && (
              <p className="mt-0.5 flex items-start gap-1 text-sm text-muted">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="line-clamp-2">{widget.placeAddress}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/dashboard/widgets/${widget.id}?tab=install`}
            className="rounded-lg gradient-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:shadow-glow"
          >
            Install
          </Link>
          <Link
            href={`/dashboard/widgets/${widget.id}`}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand/30 hover:bg-sand"
          >
            Customize
          </Link>
          <button
            type="button"
            onClick={() => setAsking(true)}
            disabled={deleting}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral/10 disabled:opacity-50"
          >
            {deleting ? "..." : "Delete"}
          </button>
        </div>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
        Place ID
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-sand px-3 py-2 font-mono text-sm">
          {widget.placeId}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard
              .writeText(widget.placeId)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
          aria-label="Copy Place ID"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:border-brand/40 hover:text-brand-dark"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-brand" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3 text-xs text-muted">
        <LiveBadge widget={widget} />
        <span>
        Added{" "}
        {new Date(widget.createdAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
        </span>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-4xl border border-dashed border-line bg-card p-12 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-wash text-brand">
        <Store className="h-6 w-6" />
      </span>
      <p className="mt-4 text-lg font-semibold">No widgets yet</p>
      <p className="mx-auto mt-1.5 max-w-sm text-muted">
        Search for a business on Google and we will save its Place ID for you.
      </p>
      <Link
        href="/dashboard/widgets/new"
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl gradient-brand px-5 font-semibold text-white transition hover:shadow-glow hover:bg-brand-dark"
      >
        <Plus className="h-4 w-4" />
        Pick a place
      </Link>
    </div>
  );
}
