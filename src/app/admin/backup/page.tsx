import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BackupView } from "@/components/admin/backup/BackupView";
import { getAdminSession } from "@/lib/admin-auth";
import { currentJob, listBackups } from "@/lib/backup";

/** System → Backup & Restore (Admin only). */
export default async function BackupPage() {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (session.role !== "admin") redirect("/admin/dashboard?denied=1");
  const [backups, run] = await Promise.all([listBackups(), Promise.resolve(currentJob())]);
  return (
    <AdminShell siteName="EduMint24" pageTitle="Backup & Restore" pageSubtitle="A complete copy of your store — download it, keep it safe, and restore it whenever you need"
      username={session.username} role={session.role} permissions={session.permissions}>
      <BackupView initial={backups} runningJob={run?.id ?? null} />
    </AdminShell>
  );
}
