import type { Metadata } from "next";

export const metadata: Metadata = { title: "Edit widget" };

export default function EditWidgetLayout({ children }: LayoutProps<"/dashboard/widgets/[id]">) {
  return children;
}
