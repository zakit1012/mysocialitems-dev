import { redirect } from "next/navigation";

/** Editing now lives on the widget page itself; keep old links working. */
export default async function EditWidgetRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/widgets/${id}`);
}
