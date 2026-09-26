/**
 * The WidgetPop mark: a bold W with a sparkle on the brand gradient. The
 * square is a CSS gradient, so the SVG needs no ids and any number of
 * logos can share a page.
 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-[28%] gradient-brand ${className}`}
    >
      <svg viewBox="2 2 60 60" className="h-full w-full">
        <path
          d="M12.5 27 L21.8 47.5 L31 33 L40.2 47.5 L49.5 27"
          fill="none"
          stroke="#fff"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M50 8 Q50.9 12.6 55 13.5 Q50.9 14.4 50 19 Q49.1 14.4 45 13.5 Q49.1 12.6 50 8 Z" fill="#fff" />
      </svg>
    </span>
  );
}

/** "Widget" in ink (or white on dark), "Pop" in the brand gradient. */
export function Wordmark({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`}>
      <span className={dark ? "text-white" : "text-ink"}>Widget</span>
      <span className="gradient-brand-text">Pop</span>
    </span>
  );
}

/** Mark and wordmark side by side. */
export function Logo({
  dark = false,
  markClassName = "h-8 w-8",
  className = "text-xl",
}: {
  dark?: boolean;
  markClassName?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <Wordmark dark={dark} />
    </span>
  );
}
