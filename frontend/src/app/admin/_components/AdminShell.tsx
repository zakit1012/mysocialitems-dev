"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowLeft,
  CreditCard,
  EyeOff,
  Gauge,
  Globe,
  LayoutGrid,
  LogOut,
  Package,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";
import { LogoutButton } from "@/components/LogoutButton";

const NAV = [
  { href: "/admin", label: "Overview", icon: Gauge },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/plans", label: "Plans", icon: Package },
  { href: "/admin/paypal", label: "PayPal", icon: Wallet },
  { href: "/admin/widgets", label: "Widgets", icon: LayoutGrid },
  { href: "/admin/sources", label: "Sources", icon: Globe },
  { href: "/admin/hidden-reviews", label: "Hidden reviews", icon: EyeOff },
];

/**
 * The super admin panel: its own dark shell, apart from the customer
 * dashboard, and only for accounts with the ADMIN role.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/admin");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 bg-dark text-dark-text">
        <Spinner className="h-5 w-5" /> Loading admin...
      </div>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-sand p-6 text-center">
        <ShieldAlert className="h-9 w-9 text-coral" />
        <p className="text-lg font-bold">Admins only</p>
        <p className="max-w-sm text-sm text-muted">This area is for the people who run My Social Items.</p>
        <Link href="/dashboard" className="mt-2 rounded-xl gradient-brand px-4 py-2 text-sm font-semibold text-white">
          Go to your dashboard
        </Link>
      </div>
    );
  }

  const current = NAV.find((n) => (n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href)));

  return (
    <div className="flex min-h-dvh flex-col bg-sand md:flex-row">
      <aside className="flex shrink-0 flex-col bg-dark text-dark-text md:sticky md:top-0 md:h-dvh md:w-60">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl gradient-brand text-sm font-black text-white shadow-glow">M</span>
          <div className="leading-tight">
            <p className="text-[15px] font-black text-white">My Social Items</p>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-light">Super admin</p>
          </div>
        </div>

        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0" aria-label="Admin">
          {NAV.map((n) => {
            const active = n === current;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition ${
                  active ? "bg-white/10 text-white" : "text-dark-text hover:bg-white/5 hover:text-white"
                }`}
              >
                <n.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-brand-light" : ""}`} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden border-t border-dark-line p-3 md:block">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-dark-text transition hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-[18px] w-[18px]" /> Back to the app
          </Link>
          <div className="mt-2 flex items-center gap-3 px-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
              <p className="truncate text-[11px] text-dark-muted">{user.email}</p>
            </div>
          </div>
          <LogoutButton className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-dark-text transition hover:bg-white/5 hover:text-white">
            <LogOut className="h-[18px] w-[18px]" /> Log out
          </LogoutButton>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-5 text-sm md:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Super admin</p>
              <h1 className="text-2xl font-black tracking-tight">{current?.label ?? "Admin"}</h1>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <Link href="/dashboard" className="rounded-lg border border-line bg-card px-3 py-1.5 text-[13px] font-medium">
                Back to the app
              </Link>
              <LogoutButton className="rounded-lg border border-line bg-card px-3 py-1.5 text-[13px] font-medium text-coral">
                Log out
              </LogoutButton>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
