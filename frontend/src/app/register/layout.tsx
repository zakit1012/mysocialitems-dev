import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Sign up free",
  description: `Create your free ${SITE.name} account and show your 5-star Google reviews on your website in about two minutes. No credit card, no coding.`,
  path: "/register",
});

export default function RegisterLayout({ children }: LayoutProps<"/register">) {
  return children;
}
