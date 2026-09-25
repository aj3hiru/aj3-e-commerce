import { headers } from "next/headers";
import { storeHostOf } from "@/lib/hosts";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsHub } from "@/components/admin/SettingsHub";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { LOGIN_GROUPS, LOGIN_PREF_KEY, LOGIN_STANDALONE } from "@/components/admin/login-settings/displayOptions";
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
    <DashboardWidgetPrefsProvider prefKey={LOGIN_PREF_KEY} groups={LOGIN_GROUPS} standalone={LOGIN_STANDALONE}>
    <AdminShell siteName="EduMint24" pageTitle="Business Settings" pageSubtitle="Login & OTP — how customers log in and sign up"
      username={session.username} role={session.role} permissions={session.permissions}
      headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}>
      <div className="mb-4 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
      <SettingsHub active="login" permissions={session.permissions}>
        <LoginSettingsForm initial={settings} origin={origin} />
      </SettingsHub>
    </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
