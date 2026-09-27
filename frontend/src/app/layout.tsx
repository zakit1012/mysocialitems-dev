import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const HOME_TITLE = `Free ${SITE.tagline} | ${SITE.name}`;

// The social cards a page falls back to when it sets none of its own.
const cards = pageMetadata({ title: HOME_TITLE, description: SITE.description, path: "/", absolute: true });

export const viewport: Viewport = {
  themeColor: "#E8446D",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: {
    default: HOME_TITLE,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [
    "Google reviews widget",
    "free Google reviews widget",
    "Google reviews for website",
    "embed Google reviews on website",
    "Google business reviews widget",
    "review widget for website",
    "testimonial widget",
    "WordPress Google reviews widget",
    "Shopify Google reviews",
    "Wix Google reviews widget",
  ],
  creator: SITE.name,
  publisher: SITE.name,
  category: "business",
  robots: {
    index: true,
    follow: true,
    // Let Google show the large preview image and full snippets.
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: cards.openGraph,
  twitter: cards.twitter,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-sand text-ink">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
