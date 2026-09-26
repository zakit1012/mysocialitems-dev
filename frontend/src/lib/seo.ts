import type { Metadata } from "next";
import { SITE } from "./site";

const OG_IMAGE = {
  url: "/marketing/editor.png",
  width: 2880,
  height: 1800,
  alt: `The ${SITE.name} widget editor with a live preview of a Google reviews carousel`,
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
  absolute = false,
}: {
  title: string;
  description: string;
  path: string;
  /** Use the title as is, without the "| WidgetPop" suffix. */
  absolute?: boolean;
}): Metadata {
  const full = absolute ? title : `${title} | ${SITE.name}`;
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: "en_US",
      url: path,
      title: full,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: full,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

/** Signed-in screens: a browser tab title, and never in search results. */
export const PRIVATE: Metadata = {
  robots: { index: false, follow: false },
};
