import Link from "next/link";
import { MapPin, Ticket, Wallet } from "lucide-react";

const STEPS = [
  { icon: MapPin, title: "Find a deal near you", text: "Filter by city and category." },
  { icon: Wallet, title: "Buy a voucher in seconds", text: "No printing, no queue." },
  { icon: Ticket, title: "Show it at the venue", text: "Scan, enjoy, done." },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-card text-ink">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1.4fr]">
          <div>
            <p className="text-xl font-black tracking-tight gradient-brand-text">My Social Items</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              Discover restaurants, hotels, wellness and days out nearby — always
              at a My Social Items price.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-sm">
              <FooterLink href="/">Browse deals</FooterLink>
              <FooterLink href="/vouchers">My vouchers</FooterLink>
              <FooterLink href="/merchant">Partner with us</FooterLink>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">How it works</p>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="rounded-2xl border border-line p-4 transition hover:border-brand/30"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-wash text-brand">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-ink">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} My Social Items — demo project.</p>
          <p className="font-mono">
            Demo logins: demo@socialdeal.local · merchant@socialdeal.local ·
            password123
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-line px-3.5 py-1.5 text-ink transition hover:border-brand/40 hover:bg-brand-wash hover:text-brand"
    >
      {children}
    </Link>
  );
}
