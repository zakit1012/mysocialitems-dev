"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "./SiteHeader";
import { Footer } from "./Footer";

/** Routes that bring their own shell (auth screens, dashboard sidebar, invoices). */
const BARE_ROUTES = ["/login", "/register", "/dashboard", "/admin", "/invoice"];

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (bare) {
    return <main className="flex-1 flex flex-col">{children}</main>;
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1 flex flex-col">{children}</main>
      <Footer />
    </>
  );
}
