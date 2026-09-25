import { redirect } from "next/navigation";
import { DisplayOptionsShell } from "@/components/admin/DisplayOptionsShell";
import { CSV_GROUPS, CSV_PREF_KEY } from "@/components/admin/pages-display";
import { CsvImportExportForm } from "@/components/admin/CsvImportExportForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

export default async function CsvImportExportPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/staff/login");
  }

  return (
    <DisplayOptionsShell prefKey={CSV_PREF_KEY} groups={CSV_GROUPS}
      siteName="EduMint24"
      pageTitle="CSV Import & Export"
      pageSubtitle="Bulk import or export your product catalog"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <CsvImportExportForm />
    </DisplayOptionsShell>
  );
}
