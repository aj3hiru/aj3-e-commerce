import { redirect } from "next/navigation";

/** Moved into the Store Customizer. */
export default function HomepageSettingsPage() {
  redirect("/admin/customizer?tab=home");
}
