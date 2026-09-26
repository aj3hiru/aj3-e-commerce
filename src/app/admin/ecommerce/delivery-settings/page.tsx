import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsHub } from "@/components/admin/SettingsHub";
import { DeliverySettingsForm } from "@/components/admin/delivery-settings/DeliverySettingsForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getDeliverySettings } from "@/lib/delivery-charge";

/** Settings → Delivery Charge: whether online orders pay for delivery, how much, and from what amount it is free. */
export default async function DeliverySettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (!hasPermission(session.permissions, "ecommerce", "manage_payment")) redirect("/admin/dashboard?denied=1");
  const settings = await getDeliverySettings();
  return (
    <AdminShell siteName="EduMint24" pageTitle="Business Settings" pageSubtitle="Delivery Charge — what online orders pay for delivery"
      username={session.username} role={session.role} permissions={session.permissions}>
      <SettingsHub active="delivery" permissions={session.permissions}>
        <DeliverySettingsForm initial={settings} />
      </SettingsHub>
    </AdminShell>
  );
}
