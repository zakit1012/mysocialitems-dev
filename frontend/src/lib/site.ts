/**
 * The brand and its addresses, in one place. Page titles, the legal pages,
 * the sitemap and the logo text all read from here.
 *
 * In production the product lives on three hosts, one Next.js server:
 *   widgetpop.com        the marketing site (home, pricing, legal pages)
 *   app.widgetpop.com    sign in and the customer dashboard
 *   admin.widgetpop.com  the super admin panel
 * Set NEXT_PUBLIC_APP_URL (and NEXT_PUBLIC_ADMIN_URL) to turn that on;
 * with them empty, as in development, everything stays on one host.
 */
const trim = (url: string | undefined) => (url ?? "").trim().replace(/\/+$/, "");

const SITE_URL = trim(process.env.NEXT_PUBLIC_SITE_URL) || "https://widgetpop.com";
const APP_URL = trim(process.env.NEXT_PUBLIC_APP_URL);
const ADMIN_URL = trim(process.env.NEXT_PUBLIC_ADMIN_URL) || APP_URL;

export const SITE = {
  name: "WidgetPop",
  domain: new URL(SITE_URL).host,
  url: SITE_URL,
  /** Where the dashboard lives, or "" when it shares the site's host. */
  appUrl: APP_URL,
  /** Where the admin panel lives, or "" when it shares the site's host. */
  adminUrl: ADMIN_URL,
  /** Where customers write for help: footer, legal pages, dashboard. */
  supportEmail: "support@widgetpop.com",
  /** The short line after the name in the home page title. */
  tagline: "Google Reviews Widget for Your Website",
  description:
    "Embed your 5-star Google reviews on any website with a widget that updates itself. Works with WordPress, Shopify, Wix and more. Free plan, no credit card.",
};

/** A link into the app (sign in, sign up, dashboard) from any host. */
export const appHref = (path: string) => `${APP_URL}${path}`;

/** A link into the admin panel from any host. */
export const adminHref = (path: string) => `${ADMIN_URL}${path}`;

/** A link to the marketing site (home, pricing, legal pages) from any host. */
export const siteHref = (path: string) => (APP_URL ? `${SITE_URL}${path}` : path);

const hostOf = (url: string) => (url ? new URL(url).host : "");

/** The three hosts; app and admin are "" until the hosts are split. */
export const HOSTS = {
  site: hostOf(SITE_URL),
  app: hostOf(APP_URL),
  admin: hostOf(ADMIN_URL),
};

/** The host a request was made to, as the browser saw it (behind nginx too). */
export function requestHost(headers: { get(name: string): string | null }): string {
  return (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
}
