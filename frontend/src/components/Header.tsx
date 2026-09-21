"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Heart, Search, Ticket, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const query = q.trim();
    router.push(query ? `/?q=${encodeURIComponent(query)}` : "/");
  }

  const searchField = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-hint" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search restaurants, spas, cities..."
        aria-label="Search deals"
        className="w-full rounded-full border border-line bg-sand-deep/40 py-2.5 pl-11 pr-4 text-sm outline-none transition placeholder:text-hint focus:border-brand focus:ring-4 focus:ring-brand/12"
      />
    </div>
  );

  return (
    <header className="sticky top-0 z-30 glass shadow-header">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="shrink-0 text-xl font-black tracking-tight gradient-brand-text transition hover:opacity-80"
        >
          My Social Items
        </Link>

        <form onSubmit={onSearch} className="hidden flex-1 md:block">
          {searchField}
        </form>

        <nav className="ml-auto flex items-center gap-1 text-sm font-medium">
          {user ? (
            <>
              <NavLink href="/favorites" className="hidden sm:inline-flex">
                <Heart className="h-4 w-4" /> Favourites
              </NavLink>
              <NavLink href="/vouchers" className="hidden sm:inline-flex">
                <Ticket className="h-4 w-4" /> Vouchers
              </NavLink>
              {(user.role === "MERCHANT" || user.role === "ADMIN") && (
                <NavLink href="/merchant" className="hidden sm:inline-flex">
                  Partner
                </NavLink>
              )}
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

      {/* Search drops to its own row on phones so the nav keeps breathing room */}
      <form onSubmit={onSearch} className="px-4 pb-3 md:hidden">
        {searchField}
      </form>
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
      className={`items-center gap-1.5 rounded-full px-3 py-2 text-ink transition hover:bg-sand-deep ${className}`}
    >
      {children}
    </Link>
  );
}
