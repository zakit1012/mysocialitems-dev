import type { Metadata } from "next";
import { SITE } from "./site";

/** The link preview card: 1200x630, under WhatsApp's 300 KB limit. */
const OG_IMAGE = {
  url: "/brand/og.jpg",
  width: 1200,
  height: 630,
  alt: `${SITE.name}: show your 5-star Google reviews on your website`,
};

/**
 * Title, description, canonical link and social cards for a public page.
 * `title` is the page's own part; the layout's template adds "| WidgetPop".
 * Next replaces openGraph and twitter whole, so every page sets all of it.
 */
export function pageMetadata({
  title,
  description,
  path,
  host = "site",
  absolute = false,
}: {
  title: string;
  description: string;
  path: string;
  /** Sign-in pages live on the app's host once the hosts are split. */
  host?: "site" | "app";
  /** Use the title as is, without the "| WidgetPop" suffix. */
  absolute?: boolean;
}): Metadata {
  const full = absolute ? title : `${title} | ${SITE.name}`;
  const url = `${host === "app" && SITE.appUrl ? SITE.appUrl : SITE.url}${path}`;
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: "en_US",
      url,
      title: full,
      description,
      images: [{ ...OG_IMAGE, url: `${SITE.url}${OG_IMAGE.url}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: full,
      description,
      images: [`${SITE.url}${OG_IMAGE.url}`],
    },
  };
}

/** Signed-in screens: a browser tab title, and never in search results. */
export const PRIVATE: Metadata = {
  robots: { index: false, follow: false },
};
