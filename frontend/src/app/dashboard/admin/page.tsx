import { redirect } from "next/navigation";

/** The admin panel moved out of the customer dashboard. */
export default function OldAdminPage() {
  redirect("/admin");
}
