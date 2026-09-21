"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowLeft,
  Globe,
  LayoutGrid,
  LogOut,
  Plus,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Spinner } from "./Spinner";

const LINKS = [
  { href: "/dashboard", label: "Widgets", icon: LayoutGrid },
  { href: "/dashboard/sources", label: "Sources", icon: Globe },
  { href: "/dashboard/widgets/new", label: "New widget", icon: Plus },
];

const ADMIN_LINK = { href: "/dashboard/admin", label: "Admin", icon: Shield };

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
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

  const links = user.role === "ADMIN" ? [...LINKS, ADMIN_LINK] : LINKS;

  return (
    /* 196px instead of 260: the labels are short and the content needs the room */
    <div className="flex-1 flex flex-col md:grid md:grid-cols-[196px_1fr]">
      <aside className="flex flex-col border-b border-line bg-card text-ink md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="px-4 pb-1 pt-5">
          <Link href="/" className="text-[15px] font-black gradient-brand-text">
            My Social Items
          </Link>
        </div>

        <nav className="mt-4 space-y-0.5 px-2">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/dashboard" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition ${
                  active
                    ? "gradient-brand text-white"
                    : "text-ink hover:bg-brand-wash hover:text-brand"
                }`}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/"
          className="mx-2 mt-4 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted transition hover:bg-brand-wash hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to site
        </Link>

        {/* Account, pinned to the bottom of the rail */}
        <div className="mt-auto border-t border-line p-3 max-md:mt-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
              <p className="truncate text-[11px] text-muted">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-muted transition hover:bg-brand-wash hover:text-brand"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <section className="flex-1 bg-sand p-5 text-sm md:p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </section>
    </div>
  );
}
