import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dodo Payments" };

export default function DodoPaymentsLayout({ children }: LayoutProps<"/admin/dodo">) {
  return children;
}
