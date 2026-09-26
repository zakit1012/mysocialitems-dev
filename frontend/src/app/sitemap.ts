import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** The public pages. Signed-in screens stay out (see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (
    path: string,
    changeFrequency: "weekly" | "monthly" | "yearly",
    priority: number,
  ) => ({ url: `${SITE.url}${path}`, changeFrequency, priority });

  return [
    page("/", "weekly", 1),
    page("/register", "monthly", 0.8),
    page("/login", "yearly", 0.3),
    page("/terms", "yearly", 0.2),
    page("/privacy", "yearly", 0.2),
    page("/refund-policy", "yearly", 0.2),
  ];
}
