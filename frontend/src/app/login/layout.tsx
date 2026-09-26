import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Log In",
  description: `Log in to your ${SITE.name} account to manage your Google reviews widgets, see views and clicks, and change your plan.`,
  path: "/login",
  host: "app",
});

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return children;
}
