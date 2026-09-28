import type { Metadata } from "next";
import { DashboardShell } from "@/components/DashboardShell";
import { PRIVATE } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  ...PRIVATE,
  // A plain title here would drop the root template for every page below.
  title: { default: "My widgets", template: `%s | ${SITE.name}` },
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <main className="flex-1 flex flex-col">
      <DashboardShell>{children}</DashboardShell>
    </main>
  );
}
