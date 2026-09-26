import Link from "next/link";
import { Star } from "lucide-react";
import { LEGAL } from "@/lib/legal";
import { SITE, appHref } from "@/lib/site";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-card text-ink">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <Link href="/" aria-label={`${SITE.name} home`} className="inline-block">
              <Logo />
            </Link>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              Show your best Google reviews on your website with a widget that
              keeps itself up to date. Build trust and win more customers.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-sm">
              <FooterLink href={appHref("/dashboard")}>Dashboard</FooterLink>
              <FooterLink href="/#pricing">Pricing</FooterLink>
              <FooterLink href={appHref("/login")}>Login</FooterLink>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-card/60 p-6 transition hover:border-brand/30 md:p-7">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-wash text-brand">
                <Star className="h-4 w-4 fill-brand text-brand" />
              </span>
              <p className="text-base font-semibold text-ink">Get Started</p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Ready to show your best Google reviews on your site? Setup takes about two minutes.
            </p>
            <div className="mt-5">
              <Link
                href={appHref("/register")}
                className="inline-flex items-center justify-center rounded-full gradient-brand px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {SITE.name}. All rights reserved.</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legal">
            <Link href="/terms" className="hover:text-brand">Terms</Link>
            <Link href="/privacy" className="hover:text-brand">Privacy</Link>
            <Link href="/refund-policy" className="hover:text-brand">Refunds</Link>
            {LEGAL.email && (
              <a href={`mailto:${LEGAL.email}`} className="hover:text-brand">
                {LEGAL.email}
              </a>
            )}
          </nav>
        </div>
        <p className="mt-3 text-xs text-hint">
          {SITE.name} is not affiliated with or endorsed by Google or any other platform whose content it shows.
          Google is a trademark of Google LLC; other names and logos belong to their owners.
        </p>
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
