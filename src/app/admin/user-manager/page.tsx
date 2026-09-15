import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { UsersTable } from "@/components/admin/UsersTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
// NOTE: `Prisma.UserWhereInput` is only resolvable once `prisma generate` has run
// against a real schema — this sandbox's stubbed client doesn't export it yet (see
// README's "Known sandbox limitation"). Using a plain object type here as a stand-in;
// once generated for real, you can restore `Prisma.UserWhereInput` for full type safety.

interface UserManagerPageProps {
  searchParams: Promise<{ search?: string; role?: string; success?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "User created successfully!",
  updated: "User updated successfully!",
};

/** Verified against admin/user-manager.php (author-profile linking intentionally
 *  excluded — blog section is out of scope for this build). */
export default async function UserManagerPage({ searchParams }: UserManagerPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "users", "create")) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const search = (params.search ?? "").trim();
  const roleFilter = params.role ?? "all";

  const where: Record<string, unknown> = {
    ...(search ? { OR: [{ username: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
    ...(roleFilter !== "all" ? { role: roleFilter } : {}),
  };

  const [users, totalUsers, totalAdmins] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { id: "desc" } }),
    prisma.user.count(),
    prisma.user.count({ where: { role: "admin" } }),
  ]);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Users Manager"
      pageSubtitle="Manage admin, editor, and author accounts"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success && SUCCESS_MESSAGES[params.success] && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          {SUCCESS_MESSAGES[params.success]}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-admin-gray-900">{totalUsers}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Total Users</div>
        </div>
        <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-violet-600">{totalAdmins}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Admins</div>
        </div>
      </div>

      <UsersTable
        users={users.map((u: (typeof users)[number]) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role as "admin" | "editor" | "author",
          status: u.status,
          permissions: u.permissions as never,
        }))}
        currentUserId={session.userId}
        search={search}
        roleFilter={roleFilter}
      />
    </AdminShell>
  );
}
