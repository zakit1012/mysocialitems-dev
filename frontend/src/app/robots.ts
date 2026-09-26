import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { HOSTS, SITE, requestHost } from "@/lib/site";

/**
 * Every page may be crawled: signed-in screens carry noindex, which a
 * crawler can only see on a page it is allowed to fetch. The admin host is
 * the exception - nothing there is public. The sitemap lists the sign-up
 * and sign-in pages on the app host too, so that host points at it as well.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = requestHost(await headers());

  if (HOSTS.admin && HOSTS.admin !== HOSTS.app && host === HOSTS.admin) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE.url}/sitemap.xml`,
    ...(host === HOSTS.app ? {} : { host: SITE.url }),
  };
}
