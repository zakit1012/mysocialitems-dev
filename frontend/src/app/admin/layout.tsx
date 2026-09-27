import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { PRIVATE } from "@/lib/seo";
import { AdminShell } from "./_components/AdminShell";

export const metadata: Metadata = {
  ...PRIVATE,
  title: { default: "Admin", template: `%s · Admin | ${SITE.name}` },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <main className="flex-1 flex flex-col">
      <AdminShell>{children}</AdminShell>
    </main>
  );
}
