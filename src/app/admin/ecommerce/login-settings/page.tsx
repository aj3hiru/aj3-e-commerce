import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { LoginSettingsForm } from "@/components/admin/login-settings/LoginSettingsForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getAuthSettings } from "@/lib/auth-settings";

/** Settings → Login & OTP: mobile OTP (Firebase) and customer password login. */
export default async function LoginSettingsPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) redirect("/staff/login");
  const [settings, h] = await Promise.all([getAuthSettings(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";

  return (
    <AdminShell siteName="EduMint24" pageTitle="Login & OTP" pageSubtitle="Let customers log in and sign up with their mobile number and an OTP"
      username={session.username} role={session.role} permissions={session.permissions}>
      <LoginSettingsForm initial={settings} origin={origin} />
    </AdminShell>
  );
}
