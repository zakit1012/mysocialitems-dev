"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowLeft,
  ChartColumn,
  CreditCard,
  Globe,
  LayoutGrid,
  LogOut,
  Plus,
  QrCode,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Spinner } from "./Spinner";
import { LogoutButton } from "./LogoutButton";
import { SITE } from "@/lib/site";

const LINKS = [
  { href: "/dashboard", label: "Widgets", icon: LayoutGrid },
  { href: "/dashboard/analytics", label: "Analytics", icon: ChartColumn },
  { href: "/dashboard/get-reviews", label: "Get reviews", icon: QrCode },
  { href: "/dashboard/sources", label: "Sources", icon: Globe },
  { href: "/dashboard/widgets/new", label: "New widget", icon: Plus },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?next=/dashboard");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-muted">
        <Spinner className="h-5 w-5" />
        Loading dashboard...
      </div>
    );
  }

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
      {/* A slim icon rail that opens over the page on hover, so content keeps its width. */}
      <aside className="group/rail flex flex-col overflow-hidden border-b border-line bg-card text-ink md:fixed md:inset-y-0 md:left-0 md:z-40 md:w-[68px] md:border-b-0 md:border-r md:transition-[width,box-shadow] md:duration-200 md:ease-out md:hover:w-[224px] md:hover:shadow-panel md:has-[:focus-visible]:w-[224px] md:has-[:focus-visible]:shadow-panel">
        <div className="flex h-16 shrink-0 items-center px-[18px]">
          <Link href="/" className="flex items-center gap-3" title={SITE.name}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg gradient-brand text-[13px] font-black text-white shadow-glow">
              W
            </span>
            <span className={`${label} text-[15px] font-black gradient-brand-text`}>{SITE.name}</span>
          </Link>
        </div>

        <nav className="mt-2 space-y-1 px-[12px]">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/dashboard" && pathname.startsWith(link.href)) ||
              // A widget's own page belongs under Widgets.
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
          href="/"
          title="Back to site"
          className="mx-[12px] mt-4 flex items-center gap-3 rounded-xl px-[12px] py-2.5 text-[13px] text-muted transition hover:bg-brand-wash hover:text-ink"
        >
          <ArrowLeft className="h-[18px] w-[18px] shrink-0" />
          <span className={label}>Back to site</span>
        </Link>

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
              href="/admin"
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
      </aside>

      <section className="min-h-dvh flex-1 bg-sand p-5 text-sm md:p-8">
        <div className={`mx-auto ${wide ? "max-w-[1480px]" : "max-w-6xl"}`}>{children}</div>
      </section>
    </div>
  );
}
