import type { Metadata } from "next";

export const metadata: Metadata = { title: "Get more reviews" };

export default function GetMoreReviewsLayout({ children }: LayoutProps<"/dashboard/get-reviews">) {
  return children;
}
