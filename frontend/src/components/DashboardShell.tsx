"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChartColumn,
  CreditCard,
  Globe,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Menu,
  Plus,
  QrCode,
  Shield,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";
import { SITE, adminHref, siteHref } from "@/lib/site";
import { LogoMark, Wordmark } from "./Logo";
import { Loader } from "./Loader";
import { Unreachable } from "./Unreachable";

const LINKS = [
  { href: "/dashboard", label: "My widgets", icon: LayoutGrid },
  { href: "/dashboard/analytics", label: "Analytics", icon: ChartColumn },
  { href: "/dashboard/get-reviews", label: "Get reviews", icon: QrCode },
  { href: "/dashboard/sources", label: "Sources", icon: Globe },
  { href: "/dashboard/widgets/new", label: "New widget", icon: Plus },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, unreachable } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Phones: the menu folds into a button in a slim top bar.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user && !unreachable) {
      // Back to this same page after signing in, not the dashboard's front.
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, unreachable, router, pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (loading) {
    return (
      <Loader full label="Loading your dashboard" />
    );
  }

  if (!user && unreachable) return <Unreachable />;

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        Redirecting to login...
      </div>
    );
  }

  const links = LINKS;
  // The widget editor needs every pixel for its live preview.
  const wide = pathname.startsWith("/dashboard/widgets/");
  // Labels hide while the rail is slim and fade in when it opens on hover.
  // Keyboard users open it too (focus-visible), but a mouse click on a link
  // must not leave it stuck open.
  const label =
    "whitespace-nowrap md:opacity-0 md:transition-opacity md:duration-150 md:group-hover/rail:opacity-100 md:group-has-[:focus-visible]/rail:opacity-100";

  return (
    <div className="flex flex-1 flex-col md:block md:pl-[68px]">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-ink/25 md:hidden"
        />
      )}
      {/* Wide screens: a slim icon rail that opens over the page on hover, so
          content keeps its width. Phones: a top bar with a menu button. */}
      <aside className="group/rail flex flex-col border-b border-line bg-card text-ink max-md:sticky max-md:top-0 max-md:z-40 md:fixed md:inset-y-0 md:left-0 md:z-40 md:w-[68px] md:overflow-hidden md:border-b-0 md:border-r md:transition-[width,box-shadow] md:duration-200 md:ease-out md:hover:w-[224px] md:hover:shadow-panel md:has-[:focus-visible]:w-[224px] md:has-[:focus-visible]:shadow-panel">
        <div className="flex h-14 shrink-0 items-center justify-between px-4 md:h-16 md:px-[18px]">
          <Link href="/dashboard" className="flex items-center gap-3" title={SITE.name}>
            <LogoMark className="h-8 w-8 shadow-glow" />
            <Wordmark className={`${label} text-[15px]`} />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="dashboard-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="grid h-10 w-10 place-items-center rounded-xl text-ink transition hover:bg-brand-wash md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* A tap on any link or button in the menu closes it on a phone. */}
        <div
          id="dashboard-menu"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a, button")) setMenuOpen(false);
          }}
          className={`flex flex-1 flex-col max-md:absolute max-md:inset-x-0 max-md:top-full max-md:max-h-[calc(100dvh-3.5rem)] max-md:overflow-y-auto max-md:border-b max-md:border-line max-md:bg-card max-md:pb-2 max-md:shadow-panel ${
            menuOpen ? "" : "max-md:hidden"
          }`}
        >
          <nav className="mt-2 space-y-1 px-[12px]">
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/dashboard" && pathname.startsWith(link.href)) ||
                // A widget's own page belongs under My widgets.
                (link.href === "/dashboard" && wide && pathname !== "/dashboard/widgets/new");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-[12px] py-2.5 text-[13.5px] font-medium transition ${
                    active
                      ? "gradient-brand text-white shadow-glow"
                      : "text-ink-soft hover:bg-brand-wash hover:text-brand"
                  }`}
                >
                  <link.icon className="h-[18px] w-[18px] shrink-0" />
                  <span className={label}>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          <Link
            href={siteHref("/")}
            title="Back to site"
            className="mx-[12px] mt-4 flex items-center gap-3 rounded-xl px-[12px] py-2.5 text-[13px] text-muted transition hover:bg-brand-wash hover:text-ink"
          >
            <ArrowLeft className="h-[18px] w-[18px] shrink-0" />
            <span className={label}>Back to site</span>
          </Link>

          <a
            href={`mailto:${SITE.supportEmail}`}
            title={`Help: ${SITE.supportEmail}`}
            className="mx-[12px] mt-1 flex items-center gap-3 rounded-xl px-[12px] py-2.5 text-[13px] text-muted transition hover:bg-brand-wash hover:text-ink"
          >
            <LifeBuoy className="h-[18px] w-[18px] shrink-0" />
            <span className={label}>Help</span>
          </a>

          {/* Account, pinned to the bottom of the rail */}
          <div className="mt-auto border-t border-line px-[12px] py-3 max-md:mt-4">
            <Link
              href="/dashboard/account"
              title="Account"
              aria-current={pathname === "/dashboard/account" ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-[6px] py-1.5 transition ${
                pathname === "/dashboard/account" ? "bg-brand-wash" : "hover:bg-brand-wash"
              }`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                {user.name.trim().charAt(0).toUpperCase()}
              </span>
              <div className={`min-w-0 flex-1 ${label}`}>
                <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
                <p className="truncate text-[11px] text-muted">{user.email}</p>
              </div>
            </Link>
            {/* The super admin panel lives apart from the customer dashboard. */}
            {user.role === "ADMIN" && (
              <Link
                href={adminHref("/admin")}
                title="Admin panel"
                className="mt-2 flex w-full items-center gap-3 rounded-xl px-[12px] py-2 text-[13px] text-muted transition hover:bg-brand-wash hover:text-brand"
              >
                <Shield className="h-[18px] w-[18px] shrink-0" />
                <span className={label}>Admin panel</span>
              </Link>
            )}
            <LogoutButton className="mt-1 flex w-full items-center gap-3 rounded-xl px-[12px] py-2 text-[13px] text-muted transition hover:bg-brand-wash hover:text-brand">
              <LogOut className="h-[18px] w-[18px] shrink-0" />
              <span className={label}>Log out</span>
            </LogoutButton>
          </div>
        </div>
      </aside>

      <section className="min-h-dvh flex-1 bg-sand p-5 text-sm md:p-8">
        <div className={`mx-auto ${wide ? "max-w-[1480px]" : "max-w-6xl"}`}>{children}</div>
      </section>
    </div>
  );
}
