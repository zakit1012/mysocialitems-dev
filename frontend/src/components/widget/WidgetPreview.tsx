"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { writeReviewUrl, type WidgetSettings } from "@/lib/widget-settings";

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
  owner_response?: { text: string; responded_at?: string | null } | string | null;
};

export type PreviewData = {
  placeId: string;
  placeName: string;
  business: { name: string | null; overall_rating: number | null; total_reviews: number | null } | null;
  reviews: PreviewReview[];
  link: string | null;
};

let loading: Promise<Renderer> | null = null;

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
  title = "Live preview",
  branding = false,
}: {
  data: PreviewData | null;
  settings: WidgetSettings;
  busy?: boolean;
  note?: string;
  title?: string;
  /** Show the "Powered by" link a Free plan widget carries. */
  branding?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<Renderer | null>(null);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

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
  }, [renderer, data, settings, device, branding]);

  const waiting = busy || (!renderer && !error) || !data;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-coral/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald/70" />
          </span>
          <p className="text-[12px] font-bold uppercase tracking-wider text-muted">{title}</p>
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

      {/* a plain "customer website" backdrop */}
      <div
        className="min-h-[420px] p-4 sm:p-6"
        style={{
          backgroundColor: "#fbfbfc",
          backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        {note && (
          <p className="mb-3 rounded-xl border border-brand/20 bg-brand-wash px-3.5 py-2.5 text-[12.5px] text-ink-soft">
            {note}
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-xl bg-coral/10 px-3.5 py-2.5 text-[12.5px] text-coral">{error}</p>
        )}
        {waiting && !error && (
          <p className="flex items-center gap-2 py-16 text-[13px] text-muted justify-center">
            <Spinner /> Loading reviews...
          </p>
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
