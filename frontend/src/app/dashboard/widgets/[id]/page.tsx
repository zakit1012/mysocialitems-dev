"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  Code2,
  Copy,
  Globe,
  MapPin,
  Paintbrush,
  Plus,
  RefreshCw,
  Store,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";
import { WidgetEditor } from "@/components/widget/WidgetEditor";
import { WidgetPreview, type PreviewData, type PreviewReview } from "@/components/widget/WidgetPreview";
import { isProLayout, layoutName, toPayload, type WidgetSettings } from "@/lib/widget-settings";
import { useLeaveGuard } from "@/lib/use-leave-guard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { timeAgo } from "@/lib/time";
import { Loader } from "@/components/Loader";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Widget = {
  id: string;
  publicKey: string;
  placeId: string;
  placeName: string;
  placeAddress: string | null;
  settings: WidgetSettings;
  lastSeenAt: string | null;
  lastSeenHost: string | null;
};

type Source = { id: string; domain: string; widget: { id: string } | null };

type EngineResult = {
  business: PreviewData["business"];
  reviews: PreviewReview[];
  link: string | null;
  served?: string | null;
  error?: string;
};

type Tab = "customize" | "install";

export default function WidgetStudioPage() {
  return (
    <Suspense fallback={<Loader label="Loading widget" />}>
      <WidgetStudio />
    </Suspense>
  );
}

function WidgetStudio() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { token } = useAuth();

  const [widget, setWidget] = useState<Widget | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState<WidgetSettings>({});
  const [draft, setDraft] = useState<WidgetSettings>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [plan, setPlan] = useState({ id: "", name: "", reviews: 3 });
  // ?tab=install straight after creating a widget, or from the dashboard;
  // a click on the tabs overrides it.
  const [picked, setTab] = useState<Tab | null>(null);
  const tab: Tab = picked ?? (params.get("tab") === "install" ? "install" : "customize");

  const [engine, setEngine] = useState<EngineResult | null>(null);
  const [reviewsBusy, setReviewsBusy] = useState(true);
  const [reviewsNote, setReviewsNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const loadSources = useCallback(async () => {
    setSources(await api<Source[]>("/sources", { token }));
  }, [token]);

  useEffect(() => {
    if (!token || !id) return;
    (async () => {
      try {
        const [w, , billing] = await Promise.all([
          api<Widget>(`/widgets/${id}`, { token }),
          loadSources(),
          api<{ plan: { id: string; name: string; reviews: number } }>("/billing", { token }).catch(() => null),
        ]);
        setWidget(w);
        setSaved(w.settings ?? {});
        setDraft(w.settings ?? {});
        if (billing) setPlan({ id: billing.plan.id, name: billing.plan.name, reviews: billing.plan.reviews });
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load this widget.");
      }
    })();
  }, [id, token, loadSources]);

  // A fetch here can mean a real scrape, not just a cache read, so it must not
  // fire on every keystroke in the editor. It runs once when the widget opens
  // (using its saved order) and again only when Save actually changes the
  // order - which also warms the review engine's cache for the live widget.
  // One request: the backend waits for a real answer itself.
  const loadReviews = useCallback(
    async (widgetId: string, sortToUse: string) => {
      if (!token) return;
      setReviewsBusy(true);
      setReviewsNote("This can take up to a minute the first time - pulling reviews from Google.");
      try {
        const r = await api<EngineResult>(`/widgets/${widgetId}/reviews?sort=${sortToUse}`, { token });
        setEngine(r);
        setReviewsNote(r.error ?? "");
      } catch (err) {
        setReviewsNote(err instanceof Error ? err.message : "Could not load reviews");
      } finally {
        setReviewsBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!widget) return;
    void loadReviews(widget.id, widget.settings.sort ?? "mostRelevant");
    // Only the widget identity should trigger this - editing draft.sort must
    // not, see loadReviews above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget?.id]);

  // Do not lose edits to a stray tab close or a click on the sidebar.
  const leaveGuard = useLeaveGuard(dirty && !saving);
  const isPaid = plan.id !== "" && plan.id !== "FREE";
  // Choosing a Pro design needs a paid plan. One saved before a downgrade can
  // stay (the site shows it as Grid) while other things are edited.
  const proLocked = plan.id === "FREE" && isProLayout(draft.layout) && draft.layout !== saved.layout;

  async function save(): Promise<boolean> {
    if (!widget) return false;
    if (proLocked) {
      setFlash({
        ok: false,
        text: `${layoutName(draft.layout)} is a Pro design. Upgrade to use it, or pick Grid, List or Carousel.`,
      });
      return false;
    }
    setSaving(true);
    setFlash(null);
    try {
      const previousSort = saved.sort ?? "mostRelevant";
      const w = await api<Widget>(`/widgets/${widget.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ settings: toPayload(draft) }),
      });
      setSaved(w.settings);
      setDraft(w.settings);
      setFlash({ ok: true, text: "Saved. Your website shows the new look on its next page load." });
      const nextSort = w.settings.sort ?? "mostRelevant";
      if (nextSort !== previousSort) void loadReviews(widget.id, nextSort);
      return true;
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  // "Is it live yet?" - read the widget again for its last-seen fields only,
  // so unsaved edits in the editor are left alone.
  const recheck = useCallback(async () => {
    if (!widget) return;
    const w = await api<Widget>(`/widgets/${widget.id}`, { token });
    setWidget((current) =>
      current ? { ...current, lastSeenAt: w.lastSeenAt, lastSeenHost: w.lastSeenHost } : current,
    );
  }, [widget, token]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <p className="text-sm text-coral">{loadError}</p>
        <Link href="/dashboard" className="text-sm font-semibold text-brand hover:underline">Back to widgets</Link>
      </div>
    );
  }

  if (!widget) {
    return (
      <Loader label="Loading widget" />
    );
  }

  const preview: PreviewData | null = engine
    ? {
        placeId: widget.placeId,
        placeName: widget.placeName,
        business: engine.business,
        reviews: engine.reviews,
        link: engine.link,
      }
    : null;

  return (
    <div className="animate-fade-in-up">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-brand">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to widgets
      </Link>

      {/* header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl gradient-brand text-white shadow-glow">
            <Store className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight">{widget.placeName}</h1>
            {widget.placeAddress && (
              <p className="flex items-center gap-1 truncate text-xs text-muted">
                <MapPin className="h-3 w-3 shrink-0" /> {widget.placeAddress}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={() => setDraft(saved)}
              className="rounded-xl border border-line bg-card px-3.5 py-2 text-[13px] font-semibold text-muted transition hover:text-ink"
            >
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 rounded-xl gradient-brand px-4 py-2 text-[13px] font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {saving ? <Spinner /> : <Check className="h-4 w-4" />}
            {dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      {flash && (
        <p className={`mt-4 rounded-xl px-3.5 py-2.5 text-[12.5px] ${flash.ok ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"}`}>
          {flash.text}
        </p>
      )}

      {/* tabs */}
      <div className="mt-5 inline-flex rounded-xl border border-line bg-card p-1 shadow-sm">
        {(
          [
            ["customize", "Customize", Paintbrush],
            ["install", "Install", Code2],
          ] as const
        ).map(([tid, label, Icon]) => (
          <button
            key={tid}
            type="button"
            onClick={() => setTab(tid)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${
              tab === tid ? "gradient-brand text-white shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "customize" ? (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[320px_1fr]">
          <WidgetEditor
            value={draft}
            onChange={setDraft}
            maxReviews={plan.reviews}
            planName={plan.name}
            canUsePro={isPaid || plan.id === ""}
          />
          <div className="min-w-0">
            <WidgetPreview data={preview} settings={draft} busy={reviewsBusy} note={reviewsNote} branding={plan.id === "FREE"} />
          </div>
        </div>
      ) : (
        <InstallPanel
          widget={widget}
          sources={sources}
          token={token}
          reload={loadSources}
          recheck={recheck}
          preview={
            <WidgetPreview
              data={preview}
              settings={saved}
              busy={reviewsBusy}
              note={reviewsNote}
              title="How it looks now"
              branding={plan.id === "FREE"}
            />
          }
          dirty={dirty}
        />
      )}

      <ConfirmDialog
        open={leaveGuard.asking}
        title="Save your changes?"
        message="Your design changes are not saved yet. Leave now and they are lost; your website keeps showing the last saved look."
        confirmLabel="Save changes"
        cancelLabel="Stay"
        altLabel="Leave without saving"
        onConfirm={async () => {
          if (await save()) leaveGuard.leave();
          else leaveGuard.stay();
        }}
        onCancel={leaveGuard.stay}
        onAlt={leaveGuard.leave}
      />
    </div>
  );
}

function InstallPanel({
  widget,
  sources,
  token,
  reload,
  recheck,
  preview,
  dirty,
}: {
  widget: Widget;
  sources: Source[];
  token: string | null;
  reload: () => Promise<void>;
  recheck: () => Promise<void>;
  preview: React.ReactNode;
  dirty: boolean;
}) {
  const [copied, setCopied] = useState("");
  const [checking, setChecking] = useState(false);
  const [domain, setDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const snippet = `<div data-widgetpop></div>\n<script src="${API_BASE}/embed/widget.js?key=${widget.publicKey}" async></script>`;
  // Domains this widget will load on: its own, plus account-wide ones.
  const allowed = sources.filter((s) => !s.widget || s.widget.id === widget.id);

  function copy(text: string, what: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(what);
        setTimeout(() => setCopied(""), 1800);
      })
      .catch(() => setCopied(""));
  }

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    setAdding(true);
    setError("");
    try {
      await api("/sources", {
        method: "POST",
        token,
        body: JSON.stringify({ domain, widgetId: widget.id }),
      });
      setDomain("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that domain");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        {dirty && (
          <p className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber-wash px-3.5 py-2.5 text-[12.5px] text-amber-dark">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            You have unsaved design changes. Save them so your website shows the new look.
          </p>
        )}

        <Step n={1} title="Allow your website">
          <p className="text-[12.5px] text-muted">
            The widget only loads on these domains; copied anywhere else it stays blank. Subdomains are included.
          </p>
          {allowed.length === 0 ? (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-coral/10 px-3 py-2 text-[12.5px] text-coral">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> No domains yet - add yours below.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {allowed.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[12.5px]">
                  <span className="flex items-center gap-1.5 font-mono">
                    <Globe className="h-3.5 w-3.5 text-emerald" /> {s.domain}
                  </span>
                  <span className="text-[11px] text-muted">{s.widget ? "this widget" : "all widgets"}</span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addDomain} className="mt-3 flex gap-2">
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yourwebsite.com"
              className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={adding || !domain.trim()}
              className="inline-flex items-center gap-1 rounded-lg gradient-brand px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {adding ? <Spinner /> : <Plus className="h-4 w-4" />} Add
            </button>
          </form>
          {error && <p className="mt-2 text-[12px] text-coral">{error}</p>}
          <Link href="/dashboard/sources" className="mt-2 inline-block text-[12px] font-semibold text-brand hover:underline">
            Manage all domains
          </Link>
        </Step>

        <Step n={2} title="Paste this code">
          <p className="text-[12.5px] text-muted">Put it where the reviews should appear, in your page&apos;s HTML.</p>
          <div className="relative mt-3">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-brand/15 bg-brand-wash/50 px-3.5 py-3 pr-11 font-mono text-[11.5px] leading-relaxed text-ink">
              {snippet}
            </pre>
            <button
              type="button"
              onClick={() => copy(snippet, "snippet")}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1 text-[11.5px] font-semibold text-ink hover:text-brand"
            >
              {copied === "snippet" ? <Check className="h-3.5 w-3.5 text-emerald" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === "snippet" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-hint">
            Optional: <code className="font-mono">data-count=&quot;5&quot;</code> or{" "}
            <code className="font-mono">data-sort=&quot;newest&quot;</code> on the div overrides the saved settings for that spot.
          </p>
        </Step>

        <Step n={3} title="Check it's live">
          {widget.lastSeenAt ? (
            <p className="flex items-start gap-2 rounded-xl bg-emerald-wash px-3 py-2.5 text-[12.5px] text-emerald-dark">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>Live{widget.lastSeenHost ? ` on ${widget.lastSeenHost}` : ""}.</b> Last seen {timeAgo(widget.lastSeenAt)}.
                Reviews refresh on their own, on your plan&apos;s schedule.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-amber-wash px-3 py-2.5 text-[12.5px] text-amber-dark">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Not seen on your site yet.{" "}
                {allowed.length === 0
                  ? "Add your domain in step 1, paste the code, then open that page once."
                  : "After pasting the code, open that page in your browser once, then check again."}
              </span>
            </p>
          )}
          <button
            type="button"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await recheck().catch(() => undefined);
              setChecking(false);
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
          >
            {checking ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} Check again
          </button>
          <div className="mt-3 grid gap-2">
            {[
              ["Widget key", widget.publicKey, "key"],
              ["Google Place ID", widget.placeId, "place"],
            ].map(([label, value, what]) => (
              <div key={what} className="flex items-center justify-between gap-2 rounded-lg bg-sand px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted">{label}</p>
                  <p className="truncate font-mono text-[12px]">{value}</p>
                </div>
                <button type="button" onClick={() => copy(value, what)} className="shrink-0 rounded-md p-1.5 text-muted hover:bg-card hover:text-brand" title="Copy">
                  {copied === what ? <Check className="h-3.5 w-3.5 text-emerald" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </Step>
      </div>

      <div className="min-w-0">{preview}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-wash text-[12px] font-bold text-brand">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
