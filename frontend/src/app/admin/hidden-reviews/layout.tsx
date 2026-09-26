import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hidden reviews" };

export default function HiddenReviewsLayout({ children }: LayoutProps<"/admin/hidden-reviews">) {
  return children;
}
