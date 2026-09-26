import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { timeAgo } from "@/lib/time";

type Widget = { id: string; lastSeenAt?: string | null; lastSeenHost?: string | null };

/**
 * The three things between signing up and reviews on the customer's site.
 * Each step links to where it is done; the card goes away once a widget has
 * actually loaded on their website.
 */
export function SetupChecklist({ widgets, domains }: { widgets: Widget[]; domains: number }) {
  const live = widgets
    .filter((w) => w.lastSeenAt)
    .sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""))[0];
  if (live) return null;

  const first = widgets[0];
  const steps = [
    {
      done: widgets.length > 0,
      title: "Create your widget",
      text: "Pick your business and choose how the reviews look.",
      href: "/dashboard/widgets/new",
      cta: "Create widget",
    },
    {
      done: domains > 0,
      title: "Allow your website",
      text: "Add the domain the widget will run on. Anywhere else it stays blank.",
      href: first ? `/dashboard/widgets/${first.id}?tab=install` : "/dashboard/sources",
      cta: "Add domain",
    },
    {
      done: false,
      title: "Paste the code and open your page",
      text: "Put one snippet into your site, then load that page once. We tick this off when we see it.",
      href: first ? `/dashboard/widgets/${first.id}?tab=install` : "/dashboard/widgets/new",
      cta: "Get the code",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);

  return (
    <section className="mt-6 rounded-2xl border border-brand/20 bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Get your reviews live</h2>
          <p className="text-sm text-muted">
            {doneCount} of {steps.length} done. About two minutes to go.
          </p>
        </div>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-brand-wash" aria-hidden>
          <div className="h-full rounded-full gradient-brand" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={`flex flex-col rounded-xl border p-4 ${
              i === next ? "border-brand/40 bg-brand-wash/40" : "border-line bg-sand"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  s.done ? "bg-emerald text-white" : i === next ? "gradient-brand text-white" : "bg-card text-muted"
                }`}
              >
                {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <p className={`text-sm font-semibold ${s.done ? "text-muted line-through" : ""}`}>{s.title}</p>
            </div>
            <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">{s.text}</p>
            {!s.done && i === next && (
              <Link href={s.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                {s.cta} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "Live on example.com · 5 min ago", or a nudge to install. */
export function LiveBadge({ widget }: { widget: Widget }) {
  if (widget.lastSeenAt) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-wash px-2.5 py-1 text-xs font-semibold text-emerald-dark">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
        Live{widget.lastSeenHost ? ` on ${widget.lastSeenHost}` : ""} · {timeAgo(widget.lastSeenAt)}
      </span>
    );
  }
  return (
    <Link
      href={`/dashboard/widgets/${widget.id}?tab=install`}
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-wash px-2.5 py-1 text-xs font-semibold text-amber-dark hover:underline"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber" />
      Not installed yet
    </Link>
  );
}
