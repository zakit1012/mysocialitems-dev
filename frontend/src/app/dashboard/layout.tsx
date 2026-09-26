import type { Metadata } from "next";
import { DashboardShell } from "@/components/DashboardShell";
import { PRIVATE } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  ...PRIVATE,
  // A plain title here would drop the root template for every page below.
  title: { default: "Widgets", template: `%s | ${SITE.name}` },
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <DashboardShell>{children}</DashboardShell>;
}
