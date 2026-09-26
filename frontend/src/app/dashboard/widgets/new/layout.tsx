import type { Metadata } from "next";

export const metadata: Metadata = { title: "New widget" };

export default function NewWidgetLayout({ children }: LayoutProps<"/dashboard/widgets/new">) {
  return children;
}
