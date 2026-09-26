import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * The public pages. Sign up and sign in live on the app host once the hosts
 * are split; its robots.txt points here, which lets this sitemap list them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const app = SITE.appUrl || SITE.url;
  const page = (
    url: string,
    changeFrequency: "weekly" | "monthly" | "yearly",
    priority: number,
  ) => ({ url, lastModified, changeFrequency, priority });

  return [
    page(`${SITE.url}/`, "weekly", 1),
    page(`${app}/register`, "monthly", 0.8),
    page(`${app}/login`, "yearly", 0.3),
    page(`${SITE.url}/terms`, "yearly", 0.2),
    page(`${SITE.url}/privacy`, "yearly", 0.2),
    page(`${SITE.url}/refund-policy`, "yearly", 0.2),
  ];
}
