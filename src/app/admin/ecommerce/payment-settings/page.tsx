import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PaymentSettingsForm } from "@/components/admin/PaymentSettingsForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export default async function PaymentSettingsPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    redirect("/shop/login");
  }

  const rows = await prisma.ecomPaymentSettings.findMany();
  const settings: Record<string, { methodKey: string; name: string; image: string | null; text: string; config: Record<string, string>; isEnabled: boolean }> = {};
  for (const r of rows) {
    settings[r.methodKey] = {
      methodKey: r.methodKey,
      name: r.name,
      image: r.image,
      text: r.text ?? "",
      config: (r.config as Record<string, string>) ?? {},
      isEnabled: r.isEnabled,
    };
  }

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Payment Settings"
      pageSubtitle="Configure the payment methods available at checkout"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <PaymentSettingsForm settings={settings} />
    </AdminShell>
  );
}
