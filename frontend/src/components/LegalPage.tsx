import Link from "next/link";
import { LEGAL } from "@/lib/legal";

const PAGES = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund & Cancellation" },
];

/** Shared frame for the legal pages: title, last-updated date, readable text. */
export function LegalPage({ title, current, children }: { title: string; current: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Legal pages">
        {PAGES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            aria-current={p.href === current ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 transition ${
              p.href === current
                ? "border-brand/40 bg-brand-wash text-brand"
                : "border-line text-muted hover:border-brand/30 hover:text-ink"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <h1 className="mt-8 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {LEGAL.updated}</p>
      <article className="mt-8 rounded-2xl border border-line/60 bg-card p-6 text-[15px] leading-relaxed text-ink-soft shadow-card sm:p-8 [&_a]:font-medium [&_a]:text-brand [&_a:hover]:underline [&_h2]:mt-9 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_h2:first-child]:mt-0 [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:text-ink [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </div>
  );
}
