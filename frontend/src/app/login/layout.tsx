import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Log in",
  description: `Log in to ${SITE.name} to manage your Google review widgets, see their views and clicks, and change your plan.`,
  path: "/login",
});

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return children;
}
