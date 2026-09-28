"use client";

import { Lock } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Said when a Free account tries to create or save a widget that uses Pro
 * choices, so it is plain why nothing happened and what to do. Plans open in
 * a new tab: the design and the fetched reviews here are kept.
 */
export function ProLockedDialog({
  choices,
  action,
  onClose,
}: {
  /** The Pro choices in use, as newProChoices() words them; empty = closed. */
  choices: string[];
  action: "create" | "save";
  onClose: () => void;
}) {
  const verb = action === "create" ? "create this widget" : "save these changes";
  return (
    <ConfirmDialog
      open={choices.length > 0}
      icon={<Lock className="h-5 w-5" />}
      title="Your widget uses Pro features"
      message={
        <>
          <p>The Free plan cannot {verb}, because {choices.length === 1 ? "this is" : "these are"} part of Pro:</p>
          <ul className="mt-2.5 space-y-1 rounded-xl bg-sand px-4 py-3 text-ink">
            {choices.map((c) => (
              <li key={c} className="flex items-start gap-2">
                <Lock className="mt-1 h-3 w-3 shrink-0 text-brand" />
                <span>
                  {c.charAt(0).toUpperCase()}
                  {c.slice(1)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5">
            Upgrade to keep {choices.length === 1 ? "it" : "them"}, or switch {choices.length === 1 ? "it" : "them"} off
            and {action === "create" ? "create your widget" : "save"} on Free.
          </p>
        </>
      }
      confirmLabel="See plans"
      cancelLabel="Change my design"
      onConfirm={() => {
        window.open("/dashboard/billing", "_blank", "noopener");
        onClose();
      }}
      onCancel={onClose}
    />
  );
}
