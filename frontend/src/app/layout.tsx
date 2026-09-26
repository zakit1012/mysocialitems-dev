import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { SiteChrome } from "@/components/SiteChrome";
import { LEGAL } from "@/lib/legal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(LEGAL.site),
  title: "My Social Items — Google Review Widgets for Your Website",
  description:
    "Show your 5-star Google reviews on your website with a beautiful widget that updates itself. Free plan, no credit card, set up in minutes.",
  openGraph: {
    type: "website",
    siteName: "My Social Items",
    images: [{ url: "/marketing/editor.png", width: 2880, height: 1800, alt: "The My Social Items widget editor" }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-sand text-ink">
        <Providers>
          <SiteChrome>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
