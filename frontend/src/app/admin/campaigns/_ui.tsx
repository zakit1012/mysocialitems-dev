"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Plus, Smartphone, X } from "lucide-react";
import { api } from "@/lib/api";
import type { CampaignSummary, Category } from "./_lib";

/** A form in a real modal (<dialog>): Escape or the backdrop closes it. */
export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto ${wide ? "w-[min(94vw,860px)]" : "w-[min(94vw,520px)]"} max-h-[90dvh] rounded-2xl border border-line bg-card p-0 text-ink shadow-panel backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]`}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted hover:bg-sand hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Tick existing categories, and optionally name a new one to create. */
export function CategoryPicker({
  categories,
  selected,
  onChange,
  newName,
  onNewName,
}: {
  categories: Category[];
  selected: string[];
  onChange: (ids: string[]) => void;
  newName: string;
  onNewName: (name: string) => void;
}) {
  const [adding, setAdding] = useState(Boolean(newName));
  return (
    <div>
      <p className="text-[13px] font-semibold">Categories</p>
      <p className="mb-2 text-xs text-muted">Optional. Pick where they go, or make a new category.</p>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((id) => id !== c.id) : [...selected, c.id])}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition ${
                on ? "border-brand bg-brand-wash text-brand-dark" : "border-line text-muted hover:text-ink"
              }`}
            >
              {c.name}
            </button>
          );
        })}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1 text-[12.5px] font-medium text-muted hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> New category
          </button>
        )}
      </div>
      {adding && (
        <input
          value={newName}
          onChange={(e) => onNewName(e.target.value)}
          maxLength={60}
          placeholder="New category name, like Agencies"
          className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand"
        />
      )}
    </div>
  );
}

export type EmailFields = { subject: string; preheader: string; heading: string; content: string };

/**
 * The email as it will arrive, drawn by the API with the same code that
 * sends it, filled in for you. Redrawn a moment after typing stops.
 */
export function EmailPreview({ email, token, className = "" }: { email: EmailFields; token: string | null; className?: string }) {
  const [html, setHtml] = useState("");
  const [subject, setSubject] = useState("");
  const [phone, setPhone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api<{ subject: string; html: string }>("/admin/mailing/preview", {
        method: "POST",
        token,
        body: JSON.stringify(email),
      })
        .then((r) => {
          if (cancelled) return;
          setHtml(r.html);
          setSubject(r.subject);
          setError("");
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Could not draw the preview");
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email, token]);

  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-card shadow-card ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line bg-sand/60 px-4 py-2.5">
        <p className="min-w-0 truncate text-[12.5px]">
          <span className="text-muted">Subject: </span>
          <b>{subject || "(no subject)"}</b>
        </p>
        <div className="flex shrink-0 rounded-lg border border-line bg-card p-0.5" role="group" aria-label="Preview size">
          {[
            { on: false, icon: Monitor, label: "Computer" },
            { on: true, icon: Smartphone, label: "Phone" },
          ].map((d) => (
            <button
              key={d.label}
              type="button"
              aria-pressed={phone === d.on}
              aria-label={d.label}
              title={d.label}
              onClick={() => setPhone(d.on)}
              className={`rounded-md p-1.5 ${phone === d.on ? "bg-brand-wash text-brand" : "text-muted hover:text-ink"}`}
            >
              <d.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="p-4 text-[13px] text-coral">{error}</p>
      ) : (
        <div className="bg-[#F4F5F7] p-3">
          <iframe
            title="Email preview"
            srcDoc={html}
            // No scripts, no navigation: only a picture of the email.
            sandbox=""
            className={`mx-auto block h-[620px] rounded-lg border-0 bg-white transition-[width] ${phone ? "w-[375px] max-w-full" : "w-full"}`}
          />
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status, counts }: { status: string; counts: CampaignSummary["counts"] }) {
  if (status === "SENDING") {
    const pct = counts.total ? Math.floor(((counts.total - counts.queued) / counts.total) * 100) : 0;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-wash px-2.5 py-0.5 text-[11.5px] font-semibold text-brand-dark">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" /> Sending · {pct}%
      </span>
    );
  }
  if (status === "STOPPED") {
    return <span className="rounded-full bg-amber-wash px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-dark">Stopped</span>;
  }
  return <span className="rounded-full bg-emerald-wash px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-dark">Sent</span>;
}
