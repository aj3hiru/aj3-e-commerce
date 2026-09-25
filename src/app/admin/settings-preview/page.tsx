import { redirect } from "next/navigation";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { StorePreviewApp } from "@/components/admin/store-preview/StorePreviewApp";

export const metadata = { title: "Store preview", robots: { index: false, follow: false } };

/** The store's header, menus and footer, fed live by Business Settings (see StorePreview). */
export default async function SettingsPreviewPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) redirect("/staff/login");
  const data = await getShopLayoutData();
  return <StorePreviewApp initial={{ ...data, customer: null }} />;
}
