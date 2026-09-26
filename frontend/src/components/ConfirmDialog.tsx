"use client";

import { useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * A yes/no question in a real modal (<dialog>): focus stays inside, Escape
 * or a click on the backdrop cancels, and it sits above every other layer.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
  altLabel,
  onAlt,
  icon,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** An optional third choice, shown on the left (e.g. "Leave without saving"). */
  altLabel?: string;
  onAlt?: () => void;
  /** Replaces the warning sign, for a question that is not a warning. */
  icon?: React.ReactNode;
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
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // A click on the dimmed backdrop lands on the dialog element itself.
        if (e.target === ref.current) onCancel();
      }}
      className={`m-auto ${altLabel ? "w-[min(92vw,470px)]" : "w-[min(92vw,400px)]"} rounded-2xl border border-line bg-card p-0 text-ink shadow-panel backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]`}
    >
      <div className="p-6">
        <span
          className={`grid h-11 w-11 place-items-center rounded-full ${danger ? "bg-coral/10 text-coral" : "bg-brand-wash text-brand"}`}
          aria-hidden
        >
          {icon ?? <TriangleAlert className="h-5 w-5" />}
        </span>
        <h2 id="confirm-title" className="mt-4 text-lg font-bold tracking-tight">
          {title}
        </h2>
        {message && <div className="mt-1.5 text-sm leading-relaxed text-muted">{message}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {altLabel && onAlt && (
            <button
              type="button"
              onClick={onAlt}
              className="mr-auto rounded-xl px-2 py-2 text-sm font-semibold text-coral transition hover:underline"
            >
              {altLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-line bg-card px-4 py-2 text-sm font-semibold text-ink transition hover:bg-sand"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
              danger ? "bg-coral hover:bg-coral-dark" : "gradient-brand hover:shadow-glow"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
