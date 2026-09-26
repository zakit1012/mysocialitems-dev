import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsLayout({ children }: LayoutProps<"/dashboard/analytics">) {
  return children;
}
