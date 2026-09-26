import type { Metadata } from "next";

export const metadata: Metadata = { title: "Plans" };

export default function PlansLayout({ children }: LayoutProps<"/admin/plans">) {
  return children;
}
