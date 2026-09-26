import type { Metadata } from "next";

export const metadata: Metadata = { title: "Widgets" };

export default function WidgetsLayout({ children }: LayoutProps<"/admin/widgets">) {
  return children;
}
