"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 glass shadow-header">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="shrink-0 text-xl font-black tracking-tight gradient-brand-text transition hover:opacity-80"
        >
          My Social Items
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm font-medium">
          {user ? (
            <>
              <NavLink href="/dashboard">
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </NavLink>
              <Link
                href="/account"
                className="ml-1 inline-flex items-center gap-2 rounded-full border border-line bg-card py-1.5 pl-1.5 pr-3.5 transition hover:border-brand/30 hover:shadow-card"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                  {user.name.trim().charAt(0).toUpperCase() || (
                    <UserRound className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="max-w-24 truncate">{user.name.split(" ")[0]}</span>
              </Link>
              <button
                onClick={() => {
                  logout();
                  router.push("/");
                }}
                className="rounded-full px-3 py-2 text-muted transition hover:bg-sand-deep hover:text-ink"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink href="/login">Log in</NavLink>
              <Link
                href="/register"
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
