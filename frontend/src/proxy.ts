import { NextResponse, type NextRequest } from "next/server";
import { HOSTS, SITE, requestHost } from "@/lib/site";

/**
 * Keeps each part of the product on its own host:
 *   widgetpop.com        home, pricing, legal pages
 *   app.widgetpop.com    sign in, sign up, dashboard, invoices
 *   admin.widgetpop.com  the admin panel (admins sign in there too)
 * A page asked for on the wrong host is redirected to the right one, and
 * www.widgetpop.com goes to widgetpop.com. With NEXT_PUBLIC_APP_URL unset
 * (development) everything is served from one host as before.
 */
type Area = "site" | "app" | "admin";

function areaOf(path: string): Area {
  if (/^\/admin(\/|$)/.test(path)) return "admin";
  if (/^\/(dashboard|login|register|invoice)(\/|$)/.test(path)) return "app";
  return "site";
}

const BASE: Record<Area, string> = { site: SITE.url, app: SITE.appUrl, admin: SITE.adminUrl };

/** Signed-in screens: search engines may crawl them, but never list them. */
function noindex() {
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export function proxy(request: NextRequest) {
  const host = requestHost(request.headers);
  const { pathname, search } = request.nextUrl;
  // Always to the public address: behind nginx request.url is localhost.
  const moveTo = (area: Area, path = pathname) =>
    NextResponse.redirect(new URL(path + search, BASE[area]), 308);
  const home = (area: Area, path: string) => NextResponse.redirect(new URL(path, BASE[area]), 307);

  if (host === `www.${HOSTS.site}`) return moveTo(HOSTS.app ? areaOf(pathname) : "site");

  // One host, or one we do not know (a server IP, a preview): serve as is.
  if (!HOSTS.app || ![HOSTS.site, HOSTS.app, HOSTS.admin].includes(host)) {
    return NextResponse.next();
  }

  const area = areaOf(pathname);
  const hasAdminHost = HOSTS.admin !== HOSTS.app;

  if (hasAdminHost && host === HOSTS.admin) {
    if (pathname === "/") return home("admin", "/admin");
    // A session lives on one host, so admins sign in here, and can open
    // any customer's invoice from Payments without a second sign-in.
    if (area === "admin" || pathname === "/login" || pathname.startsWith("/invoice/")) return noindex();
    return moveTo(area === "app" ? "app" : "site");
  }

  if (host === HOSTS.app) {
    if (pathname === "/") return home("app", "/dashboard");
    if (area === "site") return moveTo("site");
    if (area === "admin" && hasAdminHost) return moveTo("admin");
    // Sign in and sign up may show in search results; the rest may not.
    return pathname === "/login" || pathname === "/register" ? NextResponse.next() : noindex();
  }

  // The marketing site.
  return area === "site" ? NextResponse.next() : moveTo(area);
}

export const config = {
  // Not for files every host serves itself: build output, images, icons,
  // robots.txt, the sitemap and the manifest.
  matcher: [
    "/((?!_next/|brand/|marketing/|favicon\\.ico|icon\\.svg|apple-icon\\.png|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest).*)",
  ],
};
