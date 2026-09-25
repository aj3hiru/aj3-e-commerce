import { redirect } from "next/navigation";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

/** Offers & Coupons: opens the first tab this person may use. */
export default async function OffersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (hasPermission(session.permissions, "ecommerce", "manage_products")) redirect("/admin/ecommerce/campaign-offer");
  if (hasPermission(session.permissions, "ecommerce", "manage_coupons")) redirect("/admin/ecommerce/coupons");
  redirect("/admin/dashboard");
}
