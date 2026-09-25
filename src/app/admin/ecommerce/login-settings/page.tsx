import { headers } from "next/headers";
import { storeHostOf } from "@/lib/hosts";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsHub } from "@/components/admin/SettingsHub";
import { LoginSettingsForm } from "@/components/admin/login-settings/LoginSettingsForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getAuthSettings } from "@/lib/auth-settings";

/** Settings → Login & OTP: mobile OTP (Firebase) and customer password login. */
export default async function LoginSettingsPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) redirect("/staff/login");
  const [settings, h] = await Promise.all([getAuthSettings(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${storeHostOf(host)}` : "";

  return (
    <AdminShell siteName="EduMint24" pageTitle="Business Settings" pageSubtitle="Login & OTP — how customers log in and sign up"
      username={session.username} role={session.role} permissions={session.permissions}>
      <SettingsHub active="login" permissions={session.permissions}>
        <LoginSettingsForm initial={settings} origin={origin} />
      </SettingsHub>
    </AdminShell>
  );
}
