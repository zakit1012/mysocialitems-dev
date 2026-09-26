import type { Metadata } from "next";

export const metadata: Metadata = { title: "Subscriptions" };

export default function SubscriptionsLayout({ children }: LayoutProps<"/admin/subscriptions">) {
  return children;
}
