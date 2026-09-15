import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { FileManagerGrid } from "@/components/admin/FileManagerGrid";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

export default async function FileManagerPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "files", "access_file_manager")) {
    redirect("/shop/login");
  }

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="File Manager"
      pageSubtitle="Upload and manage every image, document, and media file"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <FileManagerGrid />
    </AdminShell>
  );
}
