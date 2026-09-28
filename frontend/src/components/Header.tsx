"use client";

import Link from "next/link";
import { LayoutDashboard, UserRound } from "lucide-react";
import { useAuth, useSignedIn } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";
import { SITE, appHref } from "@/lib/site";
import { Logo } from "./Logo";

export function Header() {
  // The sign-in lives on the app host; this can be the marketing site,
  // which knows only that someone is signed in, and their first name.
  const { user } = useAuth();
  const { known, name } = useSignedIn();

  return (
    <header className="sticky top-0 z-30 glass shadow-header">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label={`${SITE.name} home`} className="shrink-0 transition hover:opacity-80">
          <Logo />
        </Link>

        <nav className="mx-auto hidden items-center gap-1 text-sm font-medium text-muted lg:flex" aria-label="Sections">
          {[
            ["/#features", "Features"],
            ["/#demo", "Demo"],
            ["/#pricing", "Pricing"],
            ["/#faq", "FAQ"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-full px-3 py-2 transition hover:bg-sand-deep hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>

        <nav className="ml-auto flex items-center gap-1 text-sm font-medium lg:ml-0">
          {!known ? (
            // Held empty until it is known who is here, so nothing flickers.
            <span aria-hidden className="h-9 w-40" />
          ) : name ? (
            <>
              {/* Phones: the avatar alone leads to the dashboard, or the row
                  is wider than the screen. */}
              <NavLink href={appHref("/dashboard")} className="max-sm:hidden">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </NavLink>
              <Link
                href={appHref("/dashboard")}
                title={`${name} - dashboard`}
                aria-label={`Dashboard (${name})`}
                className="ml-1 inline-flex items-center gap-2 rounded-full border border-line bg-card p-1.5 transition hover:border-brand/30 hover:shadow-card sm:pr-3.5"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                  {name.charAt(0).toUpperCase() || <UserRound className="h-3.5 w-3.5" />}
                </span>
                <span className="max-w-24 truncate max-sm:hidden">{name}</span>
              </Link>
              {/* Only the host that keeps the sign-in can end it. */}
              {user && (
                <LogoutButton
                  redirectTo="/"
                  className="rounded-full px-3 py-2 text-muted transition hover:bg-sand-deep hover:text-ink"
                >
                  Log out
                </LogoutButton>
              )}
            </>
          ) : (
            <>
              <NavLink href={appHref("/login")}>Log in</NavLink>
              <Link
                href={appHref("/register")}
                className="rounded-full gradient-brand px-4 py-2 text-white transition hover:shadow-glow hover:shadow-card"
              >
                Join free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-ink transition hover:bg-sand-deep ${className}`}
    >
      {children}
    </Link>
  );
}
