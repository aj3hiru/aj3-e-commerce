import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageForm } from "@/components/admin/PageForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

export default async function NewPagePage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "pages", "create")) {
    redirect("/staff/login");
  }

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Add Page"
      pageSubtitle="Create a new static content page"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <PageForm initial={null} />
    </AdminShell>
  );
}
