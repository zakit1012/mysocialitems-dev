import type { Metadata } from "next";
import { Suspense } from "react";
import HomePage from "./home-client";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  path: "/",
  absolute: true,
});

// Tells Google the site's name, so results show "WidgetPop" and not the domain.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: SITE.name, url: SITE.url },
    { "@type": "Organization", name: SITE.name, url: SITE.url },
    {
      "@type": "SoftwareApplication",
      name: SITE.name,
      url: SITE.url,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: SITE.description,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <Suspense fallback={<div className="px-4 py-20 text-center">Loading...</div>}>
        <HomePage />
      </Suspense>
    </>
  );
}
