import type { Metadata } from "next";
import HomePage from "./home-client";
import { FAQ } from "@/lib/faq";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: `Free ${SITE.tagline} | ${SITE.name}`,
  description: SITE.description,
  path: "/",
  absolute: true,
});

// What search engines read about the product: the site's name (so results
// say "WidgetPop", not the domain), the logo, the free plan and the FAQ.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE.url}/#website`, name: SITE.name, url: SITE.url },
    {
      "@type": "Organization",
      "@id": `${SITE.url}/#organization`,
      name: SITE.name,
      url: SITE.url,
      logo: `${SITE.url}/brand/icon-512.png`,
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SITE.supportEmail },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE.name,
      url: SITE.url,
      image: `${SITE.url}/brand/og.jpg`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: SITE.description,
      publisher: { "@id": `${SITE.url}/#organization` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free plan" },
    },
    {
      "@type": "FAQPage",
      mainEntity: Object.values(FAQ).map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
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
      {/* No Suspense here: a fallback streamed first let the footer paint
          high up and then jump down (layout shift). */}
      <HomePage />
    </>
  );
}
