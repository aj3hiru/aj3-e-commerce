import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { FileManager2Grid } from "@/components/admin/file-manager2/FileManager2Grid";
import { FILEMANAGER2_GROUPS, FILEMANAGER2_PREF_KEY, FILEMANAGER2_STANDALONE } from "@/components/admin/file-manager2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getSiteFiles } from "@/lib/file-manager2";

/**
 * /admin/file-manager2 — a trial redesign of File Manager, kept alongside
 * /admin/file-manager so the two can be compared. Same access rule
 * (files.access_file_manager), and the Media-library part reuses the exact
 * same /api/media, /api/media/[id], /api/media/bulk-delete endpoints the v1
 * page already calls — nothing new there.
 *
 * What IS new: this page also surfaces every image the rest of the site
 * actually uses — product photos, category icons, brand logos, homepage
 * banners, payment-method icons, the site logo, author photos — pulled live
 * from their real owning tables (lib/file-manager2.ts), with each file's
 * byte size read from the real file on disk (fs.stat), not stored/guessed.
 * These entity-linked entries are shown for visibility and search, with an
 * "Open in ⟨owner⟩" link back to the page that actually manages them —
 * deliberately NOT given a Delete/Rename button here, because deleting a
 * product's image through a generic file manager would silently orphan
 * that product's image field rather than going through its own edit flow.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/file-manager2/
 *   src/components/admin/file-manager2/
 *   src/lib/file-manager2.ts
 */
export default async function FileManager2Page() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "files", "access_file_manager")) {
    redirect("/staff/login");
  }

  const files = await getSiteFiles();

  return (
    <DashboardWidgetPrefsProvider prefKey={FILEMANAGER2_PREF_KEY} groups={FILEMANAGER2_GROUPS} standalone={FILEMANAGER2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="File Manager"
        pageSubtitle="Every file and image used across your store, in one place"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}
      >
        <div className="mb-5 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
        <FileManager2Grid files={files} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
