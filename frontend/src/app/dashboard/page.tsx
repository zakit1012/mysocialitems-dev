"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, MapPin, Plus, Store } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Widget = {
  id: string;
  publicKey: string;
  placeId: string;
  placeName: string;
  placeAddress?: string | null;
  createdAt: string;
};

export default function DashboardPage() {
  const { token } = useAuth();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<Widget[]>("/widgets", { token })
      .then(setWidgets)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load widgets"),
      )
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Widgets</h1>
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

      {error && (
        <p className="mt-6 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      )}

      <div className="mt-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, i) => (
              <WidgetSkeleton key={i} />
            ))}
          </div>
        ) : widgets.length === 0 && !error ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
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

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this widget?")) return;
    setDeleting(true);
    try {
      await api(`/widgets/${widget.id}`, { method: "DELETE", token });
      onDelete(widget.id);
    } catch {
      alert("Failed to delete widget");
      setDeleting(false);
    }
  }

  return (
    <article className="flex flex-col rounded-4xl border border-line/60 bg-card p-5 shadow-card transition-shadow hover:shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-wash text-brand">
            <Store className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{widget.placeName}</h2>
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
            onClick={handleDelete}
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

      <p className="mt-4 border-t border-line/60 pt-3 text-xs text-muted">
        Added{" "}
        {new Date(widget.createdAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
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

function WidgetSkeleton() {
  return (
    <div className="rounded-4xl border border-line/60 bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-sand-deep" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 animate-pulse rounded-full bg-sand-deep" />
          <div className="h-3 w-40 animate-pulse rounded-full bg-sand-deep" />
        </div>
      </div>
      <div className="mt-6 h-9 w-full animate-pulse rounded-lg bg-sand-deep" />
    </div>
  );
}
