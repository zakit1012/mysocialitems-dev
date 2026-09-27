import type { Metadata } from "next";
import { PRIVATE } from "@/lib/seo";

export const metadata: Metadata = { ...PRIVATE, title: "Invoice" };

export default function InvoiceLayout({ children }: LayoutProps<"/invoice">) {
  return <main className="flex-1 flex flex-col">{children}</main>;
}
