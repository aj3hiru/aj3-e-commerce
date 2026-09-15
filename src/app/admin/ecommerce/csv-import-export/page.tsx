import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CsvImportExportForm } from "@/components/admin/CsvImportExportForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

export default async function CsvImportExportPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="CSV Import & Export"
      pageSubtitle="Bulk import or export your product catalog"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <CsvImportExportForm />
    </AdminShell>
  );
}
