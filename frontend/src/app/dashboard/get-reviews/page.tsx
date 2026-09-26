"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ImagePlus,
  Lock,
  Mail,
  MessageCircle,
  Printer,
  QrCode,
  Smartphone,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";
import { writeReviewUrl } from "@/lib/widget-settings";
import {
  DEFAULT_POSTER_COLOR,
  POSTER_COLORS,
  drawPoster,
  drawQr,
  loadImage,
  shrinkLogo,
} from "@/lib/review-poster";

type Widget = { id: string; placeId: string; placeName: string };
type WidgetWithLogo = Widget & { logo: string | null };

const DEFAULT_HEADLINE = "Enjoyed your visit?";
const DEFAULT_SUBTEXT = "Leave us a review on Google. It only takes a minute.";

export default function GetReviewsPage() {
  const { token } = useAuth();
  const [planId, setPlanId] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<Widget[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<{ plan: { id: string } }>("/billing", { token }),
      api<Widget[]>("/widgets", { token }),
    ])
      .then(([billing, list]) => {
        setPlanId(billing.plan.id);
        setWidgets(list);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load"));
  }, [token]);

  return (
    <div>
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight">Get more reviews</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Make it easy for happy customers to review you: a link to share, and a QR code poster for your counter,
          tables or receipts.
        </p>
      </header>

      {error && <p className="mt-6 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>}

      {!widgets || !planId ? (
        !error && (
          <p className="mt-8 flex items-center gap-2 text-muted">
            <Spinner /> Loading...
          </p>
        )
      ) : planId === "FREE" ? (
        <Locked />
      ) : widgets.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-card p-10 text-center">
          <p className="font-semibold">Create a widget first</p>
          <p className="mt-1 text-sm text-muted">The review link and QR code are made for the business your widget shows.</p>
          <Link href="/dashboard/widgets/new" className="mt-4 inline-block rounded-xl gradient-brand px-4 py-2 text-sm font-semibold text-white">
            Create widget
          </Link>
        </div>
      ) : (
        <Tools widgets={widgets} token={token} />
      )}
    </div>
  );
}

function Locked() {
  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-line bg-card shadow-card">
      <div className="grid items-center gap-8 p-8 md:grid-cols-[1fr_280px]">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-wash px-3 py-1 text-xs font-bold text-brand">
            <Lock className="h-3.5 w-3.5" /> Pro and Business
          </span>
          <h2 className="mt-4 text-2xl font-black tracking-tight">Turn happy customers into new reviews</h2>
          <ul className="mt-4 space-y-2.5 text-[15px] text-ink-soft">
            {[
              "Your direct Google review link, ready to share",
              "One tap to send it on WhatsApp, email or SMS",
              "A printable QR code poster with your logo and business name",
              "Your logo in the middle of the QR code",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-wash text-emerald">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/billing"
            className="mt-6 inline-flex items-center gap-2 rounded-xl gradient-brand px-5 py-2.5 text-sm font-bold text-white shadow-glow"
          >
            Upgrade to unlock
          </Link>
        </div>
        <div className="relative mx-auto w-56 select-none" aria-hidden>
          <div className="rounded-2xl border border-line bg-white p-5 text-center shadow-panel blur-[1.5px]">
            <div className="h-10 rounded-lg gradient-brand" />
            <p className="mt-4 text-sm font-black">Enjoyed your visit?</p>
            <p className="text-amber">★★★★★</p>
            <QrCode className="mx-auto mt-2 h-28 w-28 text-ink" strokeWidth={1.2} />
          </div>
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-white shadow-panel">
              <Lock className="h-5 w-5" />
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}

function savedColor(key: string): string {
  try {
    const saved = localStorage.getItem(key);
    if (saved && /^#[0-9a-f]{6}$/i.test(saved)) return saved;
  } catch {
    // storage blocked: the default colour is fine
  }
  return DEFAULT_POSTER_COLOR;
}

function Tools({ widgets, token }: { widgets: Widget[]; token: string | null }) {
  const [widgetId, setWidgetId] = useState(widgets[0].id);
  const [widget, setWidget] = useState<WidgetWithLogo | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [logoInQr, setLogoInQr] = useState(true);
  const [headline, setHeadline] = useState(DEFAULT_HEADLINE);
  const [subtext, setSubtext] = useState(DEFAULT_SUBTEXT);
  const [picked, setPicked] = useState<{ key: string; color: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const poster = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The poster colour is remembered per business, in this browser only.
  const colorKey = `poster-color:${widgetId}`;
  const color = picked?.key === colorKey ? picked.color : savedColor(colorKey);

  function pickColor(next: string) {
    setPicked({ key: colorKey, color: next });
    try {
      localStorage.setItem(colorKey, next);
    } catch {
      // not remembered, still used
    }
  }

  // The chosen business, with its saved logo.
  useEffect(() => {
    let cancelled = false;
    const base = widgets.find((w) => w.id === widgetId);
    api<{ logo: string | null }>(`/widgets/${widgetId}/logo`, { token })
      .catch(() => ({ logo: null }))
      .then(async ({ logo }) => {
        if (cancelled || !base) return;
        const img = logo ? await loadImage(logo).catch(() => null) : null;
        if (cancelled) return;
        setWidget({ ...base, logo });
        setLogoImg(img);
      });
    return () => {
      cancelled = true;
    };
  }, [widgetId, token, widgets]);

  const link = widget ? writeReviewUrl(widget.placeId) : "";
  const name = widget?.placeName ?? "";
  const message = `Thank you for choosing ${name}! If you have a minute, a Google review would mean a lot to us: ${link}`;

  // Redraw the poster whenever what is on it changes.
  useEffect(() => {
    if (!widget || !poster.current) return;
    void drawPoster(poster.current, {
      color,
      businessName: name,
      headline: headline.trim() || DEFAULT_HEADLINE,
      subtext: subtext.trim() || DEFAULT_SUBTEXT,
      link,
      logo: logoImg,
      logoInQr,
    });
  }, [widget, name, headline, subtext, link, logoImg, logoInQr, color]);

  const saveLogo = useCallback(
    async (logo: string | null) => {
      if (!widget) return;
      setUploading(true);
      setNote(null);
      try {
        await api(`/widgets/${widget.id}/logo`, { method: "PUT", token, body: JSON.stringify({ logo }) });
        setWidget({ ...widget, logo });
        setLogoImg(logo ? await loadImage(logo) : null);
        setNote({ ok: true, text: logo ? "Logo saved." : "Logo removed." });
      } catch (err) {
        setNote({ ok: false, text: err instanceof Error ? err.message : "Could not save the logo" });
      } finally {
        setUploading(false);
      }
    },
    [widget, token],
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      await saveLogo(await shrinkLogo(file));
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "Could not read that image" });
    }
  }

  function download(canvas: HTMLCanvasElement, filename: string) {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      // Firefox only follows a download link that is in the page.
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business";

  async function downloadQr() {
    const canvas = document.createElement("canvas");
    await drawQr(canvas, link, 1024, logoInQr ? logoImg : null);
    download(canvas, `${slug}-review-qr.png`);
  }

  function print() {
    if (!poster.current) return;
    const src = poster.current.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    // One A4 page, edge to edge: no page margins, and the image fills exactly
    // the page height so it can never spill onto a second sheet.
    w.document.write(
      `<!doctype html><title>Review poster</title><style>` +
        `@page{size:A4 portrait;margin:0}` +
        `html,body{margin:0;padding:0;height:100%;overflow:hidden}` +
        `img{display:block;width:100%;height:100vh;object-fit:contain;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
        `</style><img src="${src}" onload="setTimeout(function(){window.print()},100)">`,
    );
    w.document.close();
  }

  const btn =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm font-semibold text-ink transition hover:border-brand/40 hover:text-brand";

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <div className="space-y-5">
        {widgets.length > 1 && (
          <label className="block">
            <span className="text-sm font-semibold">Business</span>
            <select
              value={widgetId}
              onChange={(e) => setWidgetId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-brand"
            >
              {widgets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.placeName}
                </option>
              ))}
            </select>
          </label>
        )}

        <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
          <h2 className="font-bold">Your review link</h2>
          <p className="text-sm text-muted">Opens the Google review form for {name || "your business"} straight away.</p>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-xl border border-line bg-sand px-3 py-2.5 font-mono text-[12.5px] outline-none"
            />
            <button
              type="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(link)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  })
                  .catch(() => undefined)
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl gradient-brand px-4 text-sm font-semibold text-white"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <a className={btn} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(message)}`}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
            <a
              className={btn}
              href={`mailto:?subject=${encodeURIComponent(`How was your visit to ${name}?`)}&body=${encodeURIComponent(message)}`}
            >
              <Mail className="h-4 w-4" /> Email
            </a>
            <a className={btn} href={`sms:?&body=${encodeURIComponent(message)}`}>
              <Smartphone className="h-4 w-4" /> SMS
            </a>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
          <h2 className="font-bold">QR code poster</h2>
          <p className="text-sm text-muted">Print it for your counter, tables, menus or receipts. Customers scan and review.</p>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-sand">
              {widget?.logo ? (
                // A data URL the browser already has; next/image adds nothing here.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={widget.logo} alt="Your logo" className="h-full w-full object-contain p-1.5" />
              ) : (
                <ImagePlus className="h-6 w-6 text-hint" />
              )}
            </span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? <Spinner /> : <ImagePlus className="h-4 w-4" />}
                {widget?.logo ? "Change logo" : "Upload your logo"}
              </button>
              {widget?.logo && (
                <button type="button" className={btn} disabled={uploading} onClick={() => saveLogo(null)}>
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              className="hidden"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-2 text-xs text-hint">Optional. A square logo on a plain background works best.</p>

          <label className={`mt-4 flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3 ${logoImg ? "" : "opacity-50"}`}>
            <span className="text-sm">
              <span className="font-semibold">Logo in the middle of the QR code</span>
              <span className="block text-xs text-muted">The code still scans; it is built to allow a logo.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={logoInQr && Boolean(logoImg)}
              disabled={!logoImg}
              onChange={(e) => setLogoInQr(e.target.checked)}
              className="h-5 w-5 accent-brand"
            />
          </label>

          <div className="mt-4">
            <p className="text-sm font-semibold">Poster colour</p>
            <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Poster colour">
              {POSTER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color.toLowerCase() === c.toLowerCase()}
                  aria-label={c}
                  onClick={() => pickColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    color.toLowerCase() === c.toLowerCase() ? "border-ink ring-2 ring-ink/20" : "border-white shadow-card"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label
                className="relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card pl-1 pr-3 text-xs font-semibold text-ink hover:border-brand/40"
                title="Pick any colour"
              >
                <span className="h-6 w-6 rounded-full border border-line" style={{ backgroundColor: color }} />
                Custom
                <input
                  type="color"
                  value={color}
                  onChange={(e) => pickColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Custom poster colour"
                />
              </label>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="text-sm font-semibold">Headline</span>
              <input
                value={headline}
                maxLength={48}
                onChange={(e) => setHeadline(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Line under the stars</span>
              <input
                value={subtext}
                maxLength={90}
                onChange={(e) => setSubtext(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
            </label>
          </div>

          {note && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${note.ok ? "bg-emerald-wash text-emerald-dark" : "bg-coral/10 text-coral"}`}>
              {note.text}
            </p>
          )}

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => poster.current && download(poster.current, `${slug}-review-poster.png`)}
              className="inline-flex items-center justify-center gap-2 rounded-xl gradient-brand px-3.5 py-2.5 text-sm font-semibold text-white"
            >
              <Download className="h-4 w-4" /> Poster (PNG)
            </button>
            <button type="button" onClick={print} className={btn}>
              <Printer className="h-4 w-4" /> Print poster
            </button>
            <button type="button" onClick={downloadQr} className={btn}>
              <QrCode className="h-4 w-4" /> QR code only
            </button>
          </div>
        </section>
      </div>

      <div className="lg:sticky lg:top-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Poster preview (A4)</p>
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
          {widget ? (
            <canvas
              ref={poster}
              aria-label={`Review poster for ${name} with a QR code`}
              className="block h-auto w-full"
            />
          ) : (
            <p className="flex items-center justify-center gap-2 py-40 text-muted">
              <Spinner /> Loading...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
