import type { ConfigService } from '@nestjs/config';

const first = (list: string | undefined) =>
  (list ?? '').split(',')[0].trim().replace(/\/+$/, '');

/**
 * The marketing site (widgetpop.com): "Powered by" links, the privacy page,
 * the logo in emails. SITE_URL, else the first FRONTEND_URL.
 */
export function siteUrl(config: ConfigService): string {
  return (
    first(config.get<string>('SITE_URL')) ||
    first(config.get<string>('FRONTEND_URL')) ||
    'http://localhost:3002'
  );
}

/**
 * Where customers sign in (app.widgetpop.com): dashboard, billing, invoice
 * and checkout return links. APP_URL, else the site.
 */
export function appUrl(config: ConfigService): string {
  return first(config.get<string>('APP_URL')) || siteUrl(config);
}

/** The admin panel (admin.widgetpop.com): ADMIN_URL, else the app. */
export function adminUrl(config: ConfigService): string {
  return first(config.get<string>('ADMIN_URL')) || appUrl(config);
}
