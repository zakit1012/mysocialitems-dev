"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, Globe, Loader2, Lock, Sparkles } from "lucide-react";
import { PlaceAutocomplete, type PlaceSuggestion } from "@/components/PlaceAutocomplete";
import { Button } from "@/components/Button";
import { WidgetEditor } from "@/components/widget/WidgetEditor";
import { WidgetPreview, type PreviewData, type PreviewReview } from "@/components/widget/WidgetPreview";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_SETTINGS,
  PAID_DEFAULT_SORT,
  newProChoices,
  toPayload,
  type WidgetSettings,
} from "@/lib/widget-settings";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ProLockedDialog } from "@/components/ProLockedDialog";
import { Loader } from "@/components/Loader";
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
  // The Pro choices that stopped a Create, shown in a modal until closed.
  const [blocked, setBlocked] = useState<string[]>([]);

  const [status, setStatus] = useState<"idle" | "importing" | "preview" | "saving">("idle");
  const [engine, setEngine] = useState<EngineResponse | null>(null);
  // What went wrong fetching the reviews, if anything.
  const [importError, setImportError] = useState("");
  // How many reviews a widget may show on the user's current plan.
  const [plan, setPlan] = useState({ id: "FREE", name: "Free", reviews: 3 });
  // Widgets the account has and may have: at the limit, the page says so
  // before a place is picked, not after its reviews are fetched.
  // undefined while loading; null if billing did not load (the server checks anyway).
  const [widgets, setWidgets] = useState<{ used: number; max: number } | null | undefined>(undefined);
  const full = Boolean(widgets && widgets.used >= widgets.max);
  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_SETTINGS);
  const isPaid = plan.id !== "FREE";
  // Pro choices (designs, backgrounds, filters, more reviews) can be tried on Free, not saved.
  const proLocked = isPaid ? [] : newProChoices(settings, undefined, plan.reviews);
  // A Free owner previews up to 10 reviews - what an upgrade adds.
  const previewMax = isPaid ? plan.reviews : Math.max(plan.reviews, 10);
  // Paid widgets start on Newest; Free ones always show the highest-rated reviews.
  const sort = isPaid ? (settings.sort ?? PAID_DEFAULT_SORT) : undefined;
  // Reviews fetched but the widget not saved yet: a stray click on the sidebar
  // must not throw that away, or the place has to be fetched all over again.
  const leaveGuard = useLeaveGuard(status === "preview");

  useEffect(() => {
    if (!token) return;
    const load = (first: boolean) =>
      api<{
        plan: { id: string; name: string; reviews: number; widgets: number };
        usage: { widgets: number };
      }>("/billing", { token })
        .then((b) => {
          setPlan({ id: b.plan.id, name: b.plan.name, reviews: b.plan.reviews });
          setWidgets({ used: b.usage.widgets, max: b.plan.widgets });
          // A paid account's new widget starts on Newest.
          if (first && b.plan.id !== "FREE") setSettings((s) => (s.sort ? s : { ...s, sort: PAID_DEFAULT_SORT }));
        })
        .catch(() => {
          if (first) setWidgets(null);
        });
    void load(true);
    // Back from upgrading in another tab: the new plan counts straight away.
    const onFocus = () => void load(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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

    (async () => {
      // At least 10 so a Free account sees what an upgrade would add.
      const count = Math.min(50, Math.max(10, plan.reviews));
      try {
        const data = await api<EngineResponse>(
          `/places/reviews?placeId=${encodeURIComponent(place.placeId)}&count=${count}` +
            (sort ? `&sort=${sort}` : ""),
          { token },
        );
        if (cancelled) return;
        setEngine(data);
        setImportError(data.error ?? "");
        setStatus("preview");
      } catch (err) {
        if (cancelled) return;
        // Let them carry on; the widget fills in once the engine has the data.
        setImportError(err instanceof Error ? err.message : "Could not reach the review engine");
        setStatus("preview");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, place, token, plan.reviews, sort]);

  async function createWidget() {
    if (!place) return;
    if (proLocked.length) {
      setBlocked(proLocked);
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
    () => ({ ...settings, reviewCount: Math.min(settings.reviewCount ?? plan.reviews, previewMax) }),
    [settings, plan.reviews, previewMax],
  );

  // Said as news, not as a log line: what the widget will show, and what more a plan adds.
  const fetched = engine?.reviews.length ?? 0;
  const note = importError
    ? importError
    : !engine
      ? ""
      : fetched === 0
        ? "No 5-star reviews with text yet. Your widget fills in as soon as this business has some."
        : fetched > plan.reviews
          ? `Your widget shows your best ${plan.reviews}. Upgrade to show up to ${fetched}.`
          : `${fetched} five-star review${fetched === 1 ? "" : "s"} ready.`;

  return (
    <div className="animate-fade-in-up">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-brand">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to my widgets
      </Link>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl gradient-brand shadow-glow">
            <Globe className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Create widget</h1>
            <p className="text-xs text-muted">
              {full
                ? `Your ${plan.name} plan's widgets are all in use.`
                : status === "idle"
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
        {status === "idle" && widgets === undefined && <Loader label="Loading" />}

        {status === "idle" && full && widgets && (
          <div className="mx-auto max-w-lg animate-scale-in rounded-3xl border border-line/50 bg-card p-8 text-center shadow-panel">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-wash">
              <Lock className="h-6 w-6 text-brand" />
            </div>
            <h2 className="text-lg font-bold">You have used all your widgets</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Your {plan.name} plan includes {widgets.max} widget{widgets.max === 1 ? "" : "s"}, and you have{" "}
              {widgets.used}. Upgrade to add another, or change the one{widgets.used === 1 ? "" : "s"} you have.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                href="/dashboard/billing"
                className="inline-flex items-center gap-1.5 rounded-xl gradient-brand px-4 py-2 text-[13px] font-bold text-white shadow-glow transition hover:brightness-110"
              >
                See plans
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-sand"
              >
                Back to my widgets
              </Link>
            </div>
          </div>
        )}

        {status === "idle" && widgets !== undefined && !full && (
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
                setImportError("");
                setEngine(null);
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
            <h2 className="text-lg font-bold">Getting your reviews from Google</h2>
            <p className="mt-2 text-sm text-muted">
              For <span className="font-semibold text-ink">{place?.name}</span>
            </p>
            {/* No % shown - a new place can take anywhere from a few seconds to
                a minute or two, so a fake progress number would just be a lie. */}
            <div className="mx-auto mt-8 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-sand-deep">
              <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full gradient-brand" />
            </div>
            <p className="mt-6 text-[13px] leading-relaxed text-muted">
              {waitedSec < 40
                ? "The first time takes a minute or two. After that, your widget loads instantly."
                : "Still working - businesses with many reviews take a little longer. Please keep this page open."}
            </p>
            <p className="mt-2 text-[11px] font-medium tabular-nums text-hint">{waitedSec}s</p>
          </div>
        )}

        {(status === "preview" || status === "saving") && (
          <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
            <WidgetEditor
              value={settings}
              onChange={setSettings}
              maxReviews={previewMax}
              saveReviews={plan.reviews}
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
              <WidgetPreview
                data={preview}
                settings={previewSettings}
                note={note}
                noteTone={importError ? "problem" : "info"}
                branding={plan.id === "FREE"}
              />
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
      <ProLockedDialog choices={blocked} action="create" onClose={() => setBlocked([])} />
    </div>
  );
}
