import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { UserManager2Body, Users2AddButton, type User2Row } from "@/components/admin/user-manager2/UserManager2Body";
import { USERS2_GROUPS, USERS2_PREF_KEY, USERS2_STANDALONE } from "@/components/admin/user-manager2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { DEFAULT_PERMISSIONS, normalizePermissions, type PermissionsShape } from "@/lib/permissions";

/**
 * /admin/user-manager2 — a trial redesign of Users Manager, kept alongside
 * /admin/user-manager so the two can be compared. Same access rule
 * (users.create), same users table, and — unlike every other "2" page so
 * far — NO new API routes: create/edit/delete/status all reuse the exact
 * same /api/users and /api/users/[id] endpoints the v1 page already calls,
 * because those endpoints are generic enough (JSON body, not tied to any
 * particular page's redirect) that a second UI can call them directly.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/user-manager2/
 *   src/components/admin/user-manager2/
 * (lib/permissions.ts's countGrantedPermissions() can stay — it's a
 * harmless, reusable helper even if this page goes away.)
 */
export default async function UserManager2Page() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "users", "create")) {
    redirect("/shop/login");
  }

  const rows = await prisma.user.findMany({ orderBy: { id: "desc" } });
  const users: User2Row[] = (rows as { id: number; username: string; email: string; role: string; status: string; permissions: unknown }[]).map((u) => ({
    id: u.id, username: u.username, email: u.email,
    role: u.role,
    status: u.status, permissions: { ...(JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)) as PermissionsShape), ...(normalizePermissions(u.permissions, u.role) as unknown as PermissionsShape) },
  }));

  return (
    <DashboardWidgetPrefsProvider prefKey={USERS2_PREF_KEY} groups={USERS2_GROUPS} standalone={USERS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Users Manager"
        pageSubtitle="Manage admin, editor, and author accounts"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /><Users2AddButton /></div>}
      >
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" /><Users2AddButton />
        </div>
        <UserManager2Body users={users} currentUserId={session.userId} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
