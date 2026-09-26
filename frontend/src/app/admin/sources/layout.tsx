import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sources" };

export default function SourcesLayout({ children }: LayoutProps<"/admin/sources">) {
  return children;
}
