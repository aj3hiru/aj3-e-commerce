import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getAuthSettings } from "@/lib/auth-settings";
import { StorePreviewApp } from "@/components/admin/store-preview/StorePreviewApp";

export const metadata = { title: "Store preview", robots: { index: false, follow: false } };

/** The store (or its login / a static page), fed live by admin settings screens (see StorePreview). Staff only. */
export default async function SettingsPreviewPage() {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  const [data, auth] = await Promise.all([getShopLayoutData(), getAuthSettings()]);
  return <StorePreviewApp initial={{ ...data, customer: null }} auth={auth} />;
}
