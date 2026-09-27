import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Create a Free Google Reviews Widget",
  description:
    "Sign up free and show your best Google reviews on your website in 2 minutes. No coding, no Google login and no credit card needed.",
  path: "/register",
  host: "app",
});

export default function RegisterLayout({ children }: LayoutProps<"/register">) {
  return <main className="flex-1 flex flex-col">{children}</main>;
}
