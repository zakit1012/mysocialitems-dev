"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Pipette, Smartphone } from "lucide-react";
import { writeReviewUrl, type WidgetSettings } from "@/lib/widget-settings";
import { Loader } from "@/components/Loader";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Renderer = { render: (el: HTMLElement, data: unknown) => void };

declare global {
  interface Window {
    WidgetPop?: Renderer;
  }
}

export type PreviewReview = {
  review_id: string | null;
  author: string | null;
  author_photo?: string | null;
  rating: number | null;
  text: string;
  published_at_text: string | null;
  images?: string[];
};

export type PreviewData = {
  placeId: string;
  placeName: string;
  business: { name: string | null; overall_rating: number | null; total_reviews: number | null } | null;
  reviews: PreviewReview[];
  link: string | null;
};

let loading: Promise<Renderer> | null = null;

/** Page colours to try the widget on; null is the plain dotted page. */
const BACKDROPS: { color: string | null; label: string }[] = [
  { color: null, label: "Plain page" },
  { color: "#ffffff", label: "White" },
  { color: "#0f172a", label: "Dark" },
  { color: "#1d4ed8", label: "Blue" },
];
const DOTS = {
  backgroundColor: "#fbfbfc",
  backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
  backgroundSize: "16px 16px",
};

/**
 * The preview draws with the real embed renderer (widget.js?preview=1), so it
 * can never drift from what visitors see on the customer's site.
 */
function loadRenderer(): Promise<Renderer> {
  if (window.WidgetPop?.render) return Promise.resolve(window.WidgetPop);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${API}/embed/widget.js?preview=1`;
      script.async = true;
      script.onload = () =>
        window.WidgetPop?.render
          ? resolve(window.WidgetPop)
          : reject(new Error("The widget script loaded but did not start."));
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new Error("Could not load the widget script from the API."));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export function WidgetPreview({
  data,
  settings,
  busy,
  note,
  noteTone = "info",
  title = "Live preview",
  branding = false,
}: {
  data: PreviewData | null;
  settings: WidgetSettings;
  busy?: boolean;
  note?: string;
  /** "problem" when the note says something went wrong. */
  noteTone?: "info" | "problem";
  title?: string;
  /** Show the "Powered by" link a Free plan widget carries. */
  branding?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<Renderer | null>(null);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  // The colour of the owner's own site, to see a transparent background on it.
  const [backdrop, setBackdrop] = useState<string | null>(null);

  useEffect(() => {
    loadRenderer()
      .then(setRenderer)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!renderer || !host.current || !data) return;
    renderer.render(host.current, {
      business: data.business,
      reviews: data.reviews,
      link: data.link,
      branding: branding ? { url: window.location.origin } : null,
      widget: {
        placeName: data.placeName,
        settings,
        writeReviewUrl: writeReviewUrl(data.placeId),
      },
    });
    // backdrop: a transparent widget picks its heading colour from the page.
  }, [renderer, data, settings, device, branding, backdrop]);

  const waiting = busy || (!renderer && !error) || !data;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-coral/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald/70" />
          </span>
          <p className="text-[12px] font-bold uppercase tracking-wider text-muted">{title}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" title="Try it on your website's colour">
            <span className="hidden text-[11px] font-semibold text-muted sm:inline">Your site</span>
            {BACKDROPS.map((b) => (
              <button
                key={b.label}
                type="button"
                title={b.label}
                aria-label={`Page colour: ${b.label}`}
                aria-pressed={backdrop === b.color}
                onClick={() => setBackdrop(b.color)}
                style={b.color ? { background: b.color } : DOTS}
                className={`h-5 w-5 rounded-full border transition hover:scale-110 ${
                  backdrop === b.color ? "border-transparent ring-2 ring-brand ring-offset-1" : "border-line"
                }`}
              />
            ))}
            <label
              title="Pick your site's colour"
              className={`relative grid h-5 w-5 cursor-pointer place-items-center overflow-hidden rounded-full border bg-card hover:scale-110 ${
                backdrop && !BACKDROPS.some((b) => b.color === backdrop)
                  ? "border-transparent ring-2 ring-brand ring-offset-1"
                  : "border-line"
              }`}
              style={backdrop && !BACKDROPS.some((b) => b.color === backdrop) ? { background: backdrop } : undefined}
            >
              <Pipette className="h-2.5 w-2.5 text-muted" />
              <input
                type="color"
                aria-label="Pick your site's colour"
                value={backdrop ?? "#ffffff"}
                onChange={(e) => setBackdrop(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
          <div className="flex rounded-lg border border-line bg-sand p-0.5">
            {(
              [
                ["desktop", Monitor, "Desktop"],
                ["mobile", Smartphone, "Mobile"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                title={label}
                aria-pressed={device === id}
                onClick={() => setDevice(id)}
                className={`rounded-md px-2 py-1 transition ${
                  device === id ? "bg-card text-brand shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* the "customer website" the widget sits on */}
      <div
        className="min-h-[420px] p-4 transition-colors sm:p-6"
        style={backdrop ? { backgroundColor: backdrop } : DOTS}
      >
        {note && (
          <p
            className={`mb-3 rounded-xl border px-3.5 py-2.5 text-[12.5px] ${
              noteTone === "problem"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-line bg-card text-ink-soft"
            }`}
          >
            {note}
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-xl bg-coral/10 px-3.5 py-2.5 text-[12.5px] text-coral">{error}</p>
        )}
        {waiting && !error && (
          <Loader label="Loading reviews" className="py-16" />
        )}
        <div
          className={`transition-all duration-300 ${device === "mobile" ? "mx-auto w-[360px] max-w-full" : "w-full"} ${
            waiting ? "hidden" : ""
          }`}
        >
          <div ref={host} />
        </div>
      </div>
    </div>
  );
}
