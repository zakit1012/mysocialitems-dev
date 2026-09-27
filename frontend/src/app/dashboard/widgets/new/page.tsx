"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, Globe, Loader2, Sparkles } from "lucide-react";
import { PlaceAutocomplete, type PlaceSuggestion } from "@/components/PlaceAutocomplete";
import { Button } from "@/components/Button";
import { WidgetEditor } from "@/components/widget/WidgetEditor";
import { WidgetPreview, type PreviewData, type PreviewReview } from "@/components/widget/WidgetPreview";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DEFAULT_SETTINGS, newProChoices, proMessage, toPayload, type WidgetSettings } from "@/lib/widget-settings";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useLeaveGuard } from "@/lib/use-leave-guard";

type EngineResponse = {
  business: PreviewData["business"];
  reviews: PreviewReview[];
  link: string | null;
  served: string | null;
  took_ms: number;
  error?: string;
};

export default function NewWidgetPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [place, setPlace] = useState<PlaceSuggestion | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState("");

  const [status, setStatus] = useState<"idle" | "importing" | "preview" | "saving">("idle");
  const [engine, setEngine] = useState<EngineResponse | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [importNote, setImportNote] = useState("");
  // How many reviews a widget may show on the user's current plan.
  const [plan, setPlan] = useState({ id: "FREE", name: "Free", reviews: 3 });
  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_SETTINGS);
  const isPaid = plan.id !== "FREE";
  // Pro designs and backgrounds can be tried on Free, not saved.
  const proLocked = isPaid ? [] : newProChoices(settings);
  // Reviews fetched but the widget not saved yet: a stray click on the sidebar
  // must not throw that away, or the place has to be fetched all over again.
  const leaveGuard = useLeaveGuard(status === "preview");

  useEffect(() => {
    if (!token) return;
    api<{ plan: { id: string; name: string; reviews: number } }>("/billing", { token })
      .then((b) => setPlan({ id: b.plan.id, name: b.plan.name, reviews: b.plan.reviews }))
      .catch(() => undefined);
  }, [token]);

  // Ticks while the single import request is in flight, so the spinner
  // screen visibly keeps working instead of sitting still for up to a
  // minute - without pretending to know a percentage it cannot know.
  const [waitedSec, setWaitedSec] = useState(0);
  useEffect(() => {
    if (status !== "importing") return;
    const timer = setInterval(() => setWaitedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  // A closed tab mid-import loses nothing server-side, but the person would
  // have to start the import over - worth one warning before that happens.
  useEffect(() => {
    if (status !== "importing") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  /* real import: one request - the backend waits for a real answer itself */
  useEffect(() => {
    if (status !== "importing" || !place) return;
    let cancelled = false;
    const started = Date.now();

    (async () => {
      // At least 10 so a Free account sees what an upgrade would add.
      const count = Math.min(50, Math.max(10, plan.reviews));
      try {
        const data = await api<EngineResponse>(
          `/places/reviews?placeId=${encodeURIComponent(place.placeId)}&count=${count}`,
          { token },
        );
        if (cancelled) return;
        setEngine(data);
        setImportNote(data.error ?? "");
        setTookMs(Date.now() - started);
        setStatus("preview");
      } catch (err) {
        if (cancelled) return;
        // Let them carry on; the widget fills in once the engine has the data.
        setImportNote(err instanceof Error ? err.message : "Could not reach the review engine");
        setStatus("preview");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, place, token, plan.reviews]);

  async function createWidget() {
    if (!place) return;
    if (proLocked.length) {
      setError(proMessage(proLocked));
      return;
    }
    setStatus("saving");
    setError("");
    try {
      const widget = await api<{ id: string }>("/widgets", {
        method: "POST",
        token,
        body: JSON.stringify({ placeId: place.placeId, sessionToken, settings: toPayload(settings) }),
      });
      // Straight to the embed code - that is the next thing they need.
      router.push(`/dashboard/widgets/${widget.id}?tab=install`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create widget");
      setStatus("preview");
    }
  }

  const preview: PreviewData | null = useMemo(
    () =>
      place && engine
        ? {
            placeId: place.placeId,
            placeName: place.name,
            business: engine.business,
            reviews: engine.reviews,
            link: engine.link,
          }
        : place
          ? { placeId: place.placeId, placeName: place.name, business: null, reviews: [], link: null }
          : null,
    [place, engine],
  );

  // The preview shows what the plan allows, not everything we fetched.
  const previewSettings = useMemo(
    () => ({ ...settings, reviewCount: Math.min(settings.reviewCount ?? plan.reviews, plan.reviews) }),
    [settings, plan.reviews],
  );

  const fetched = engine?.reviews.length ?? 0;
  const note =
    fetched > plan.reviews
      ? `Your ${plan.name} plan shows ${plan.reviews} reviews per widget. Upgrade in Billing to show up to ${fetched} or more.`
      : importNote || (tookMs !== null ? `${fetched} reviews loaded in ${(tookMs / 1000).toFixed(1)}s.` : "");

  return (
    <div className="animate-fade-in-up">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-brand">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to widgets
      </Link>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl gradient-brand shadow-glow">
            <Globe className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Create widget</h1>
            <p className="text-xs text-muted">
              {status === "idle"
                ? "Pick your business on Google."
                : status === "importing"
                  ? "Getting your reviews..."
                  : "Make it yours, then create it."}
            </p>
          </div>
        </div>
        {(status === "preview" || status === "saving") && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                leaveGuard.guard(() => {
                  setPlace(null);
                  setEngine(null);
                  setStatus("idle");
                })
              }
              className="inline-flex items-center gap-1 rounded-xl border border-line bg-card px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-brand"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Pick another place
            </button>
            <button
              type="button"
              onClick={createWidget}
              disabled={status === "saving"}
              className="inline-flex items-center gap-1.5 rounded-xl gradient-brand px-4 py-2 text-[13px] font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-60"
            >
              {status === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Create widget
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-coral/10 px-3.5 py-2.5 text-[12.5px] text-coral">
          {error}{" "}
          {/limit|plan|upgrade/i.test(error) && (
            <Link href="/dashboard/billing" className="font-semibold underline">See plans</Link>
          )}
        </p>
      )}

      <div className="mt-8">
        {status === "idle" && (
          <div className="mx-auto max-w-lg animate-scale-in space-y-4 rounded-3xl border border-line/50 bg-card p-8 shadow-panel">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-brand" />
              <p className="font-semibold">Search for your business</p>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Start typing a name or paste a Google Maps URL to connect your business.
            </p>
            <PlaceAutocomplete
              onSelect={(p, t) => {
                setPlace(p);
                setSessionToken(t);
                setError("");
                // A fresh import screen; the effect above does the fetching.
                setImportNote("This can take up to a minute the first time - pulling reviews from Google. No need to reload.");
                setEngine(null);
                setTookMs(null);
                setWaitedSec(0);
                setStatus("importing");
              }}
            />
          </div>
        )}

        {status === "importing" && (
          <div className="mx-auto max-w-md animate-fade-in-up rounded-3xl border border-line/50 bg-card p-12 text-center shadow-panel">
            <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-brand-wash">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
            </div>
            <h2 className="text-lg font-bold">Fetching reviews…</h2>
            <p className="mt-2 text-sm text-muted">
              Getting reviews for <span className="font-semibold text-ink">{place?.name}</span>
            </p>
            {/* No % shown - a new place can take anywhere from a few seconds to
                a minute or two, so a fake progress number would just be a lie. */}
            <div className="mx-auto mt-10 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sand-deep">
              <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full gradient-brand" />
            </div>
            {importNote && <p className="mt-4 text-xs text-muted">{importNote}</p>}
            <p className="mt-2 text-[11px] font-medium tabular-nums text-hint">Still working... {waitedSec}s</p>
          </div>
        )}

        {(status === "preview" || status === "saving") && (
          <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
            <WidgetEditor
              value={settings}
              onChange={setSettings}
              maxReviews={plan.reviews}
              planName={plan.name}
              canUsePro={isPaid}
              footer={
                <>
                  <Button loading={status === "saving"} onClick={createWidget} className="h-11">
                    Create widget
                  </Button>
                </>
              }
            />
            <div className="min-w-0">
              <WidgetPreview data={preview} settings={previewSettings} note={note} branding={plan.id === "FREE"} />
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={leaveGuard.asking}
        title="Save this widget first?"
        message={`The reviews for ${place?.name ?? "this place"} are fetched and your design is ready, but the widget is not saved. If you leave now, you will have to find the place and fetch its reviews again.`}
        confirmLabel="Save widget"
        cancelLabel="Stay"
        altLabel="Leave without saving"
        onConfirm={() => {
          leaveGuard.stay();
          void createWidget();
        }}
        onCancel={leaveGuard.stay}
        onAlt={leaveGuard.leave}
      />
    </div>
  );
}
