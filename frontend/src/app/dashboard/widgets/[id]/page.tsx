"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  Clock,
  Copy,
  Globe,
  RefreshCw,
  Star,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Widget = {
  id: string;
  publicKey: string;
  placeId: string;
  placeName: string;
  placeAddress: string | null;
};

type Source = { id: string; domain: string; widget: { id: string } | null };

type Review = {
  review_id: string | null;
  author: string | null;
  author_photo: string | null;
  rating: number | null;
  text: string;
  published_at_text: string | null;
  images: string[];
};

type Preview = {
  business: { name: string | null; overall_rating: number | null; total_reviews: number | null } | null;
  reviews: Review[];
  took_ms: number;
  error?: string;
};

export default function WidgetPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [widget, setWidget] = useState<Widget | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  const snippet = widget
    ? `<div data-msi-widget data-count="6"></div>\n<script src="${API_BASE}/embed/widget.js?key=${widget.publicKey}" async></script>`
    : "";

  const loadPreview = useCallback(
    async (key: string) => {
      setLoadingPreview(true);
      try {
        // Same endpoint the embed uses; the browser sends this page's Origin,
        // which is localhost in development and therefore always allowed.
        const res = await fetch(
          `${API_BASE}/embed/widgets/${key}/reviews?count=6`,
        );
        const body = await res.json();
        setPreview(res.ok ? body : { business: null, reviews: [], took_ms: 0, error: body.error });
      } catch (err) {
        setPreview({
          business: null,
          reviews: [],
          took_ms: 0,
          error: err instanceof Error ? err.message : "Preview failed",
        });
      } finally {
        setLoadingPreview(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!token || !id) return;
    (async () => {
      try {
        const [w, s] = await Promise.all([
          api<Widget>(`/widgets/${id}`, { token }),
          api<Source[]>("/sources", { token }),
        ]);
        setWidget(w);
        setSources(s);
        loadPreview(w.publicKey);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load widget");
      }
    })();
  }, [id, token, loadPreview]);

  function copy(text: string, what: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(what);
        setTimeout(() => setCopied(""), 2000);
      })
      .catch(() => setCopied(""));
  }

  if (error) {
    return <p className="rounded-2xl bg-coral/10 px-4 py-3 text-coral">{error}</p>;
  }
  if (!widget) {
    return (
      <p className="flex items-center gap-2 text-muted">
        <Spinner /> Loading widget...
      </p>
    );
  }

  const allowed = sources.filter(
    (s) => !s.widget || s.widget.id === widget.id,
  );

  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-[13px] font-medium text-muted transition hover:text-brand"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to widgets
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-black tracking-tight">{widget.placeName}</h1>
        <p className="mt-1 text-muted">{widget.placeAddress}</p>
      </header>

      {/* Integration */}
      <section className="mb-5 rounded-2xl border border-line bg-card p-5 shadow-card">
        <h2 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-muted">
          Integration
        </h2>
        <p className="mb-3 text-[13px] text-ink-soft">
          Paste this where the reviews should appear.
        </p>

        <div className="relative">
          <pre className="overflow-x-auto rounded-xl bg-ink px-4 py-3.5 text-[12.5px] leading-relaxed text-white/90">
            <code>{snippet}</code>
          </pre>
          <button
            type="button"
            onClick={() => copy(snippet, "snippet")}
            className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/20"
          >
            {copied === "snippet" ? (
              <>
                <Check className="h-3.5 w-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy
              </>
            )}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Widget key" value={widget.publicKey} onCopy={() => copy(widget.publicKey, "key")} copied={copied === "key"} />
          <Field label="Place ID" value={widget.placeId} onCopy={() => copy(widget.placeId, "place")} copied={copied === "place"} />
        </div>

        {allowed.length === 0 ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-coral/30 bg-coral/5 px-4 py-3 text-[13px] text-coral">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This widget has no allowed domain, so the snippet will refuse to
              load.{" "}
              <Link href="/dashboard/sources" className="font-semibold underline">
                Add one under Sources
              </Link>
              .
            </span>
          </div>
        ) : (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <Globe className="h-3.5 w-3.5" />
            Works on:
            {allowed.map((s) => (
              <span
                key={s.id}
                className="rounded-full border border-line bg-sand px-2.5 py-0.5 text-[12px] font-medium text-ink"
              >
                {s.domain}
              </span>
            ))}
          </p>
        )}
      </section>

      {/* Live preview */}
      <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">
            Live preview
          </h2>
          <div className="flex items-center gap-3">
            {preview && !preview.error && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sand px-2.5 py-1 text-[12px] font-semibold text-muted">
                <Clock className="h-3.5 w-3.5" />
                {preview.took_ms} ms
              </span>
            )}
            <button
              type="button"
              onClick={() => loadPreview(widget.publicKey)}
              disabled={loadingPreview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingPreview ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {loadingPreview ? (
          <p className="flex items-center gap-2 py-6 text-muted">
            <Spinner /> Fetching reviews from the engine...
          </p>
        ) : preview?.error ? (
          <p className="rounded-xl bg-coral/10 px-4 py-3 text-[13px] text-coral">
            {preview.error}
          </p>
        ) : !preview || preview.reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-muted">
            No reviews came back yet. The engine fetches a new place in the
            background &mdash; press Refresh in a few seconds.
          </p>
        ) : (
          <>
            {preview.business && (
              <div className="mb-4 flex flex-wrap items-center gap-2.5">
                <span className="text-xl font-black">
                  {preview.business.overall_rating ?? "-"}
                </span>
                <Stars value={preview.business.overall_rating ?? 0} />
                <span className="text-[13px] text-muted">
                  {preview.business.total_reviews?.toLocaleString()} reviews on Google
                </span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {preview.reviews.map((r, i) => (
                <article
                  key={r.review_id ?? i}
                  className="rounded-xl border border-line bg-sand/60 p-3.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-wash text-[12px] font-bold text-brand">
                      {(r.author ?? "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">
                        {r.author ?? "Google user"}
                      </p>
                      <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
                        <Stars value={r.rating ?? 0} small />
                        {r.published_at_text}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2.5 line-clamp-5 text-[13px] leading-relaxed text-ink-soft">
                    {r.text}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-sand px-3 py-2 font-mono text-[12.5px]">
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded-lg border border-line px-2.5 py-2 transition hover:border-brand/40 hover:text-brand"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function Stars({ value, small }: { value: number; small?: boolean }) {
  const size = small ? "h-3 w-3" : "h-4 w-4";
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${size} ${n <= rounded ? "fill-coral text-coral" : "text-line"}`}
        />
      ))}
    </span>
  );
}
