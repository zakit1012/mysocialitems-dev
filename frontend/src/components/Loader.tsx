import { LogoMark } from "./Logo";

/**
 * The one loading look: the W mark inside a turning ring. Every page and
 * section that waits for data uses it; buttons keep their small Spinner.
 */
export function LoaderMark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-9 w-9" : "h-14 w-14";
  const mark = size === "sm" ? "h-5 w-5" : "h-8 w-8";
  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center ${box}`}>
      <span className="absolute inset-0 rounded-full border-[3px] border-brand/15 border-t-brand motion-safe:animate-spin" />
      <LogoMark className={mark} />
    </span>
  );
}

/** A waiting page or section: the mark and a short line under it. */
export function Loader({
  label = "Loading",
  full = false,
  dark = false,
  className = "py-24",
}: {
  label?: string;
  /** Fill the screen (before a shell or sign-in can show). */
  full?: boolean;
  /** On the dark admin background. */
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 ${full ? "min-h-dvh" : className} ${
        dark ? "bg-dark text-dark-text" : "text-muted"
      }`}
    >
      <LoaderMark />
      <span className="text-[13px] font-medium">{label}…</span>
    </div>
  );
}
