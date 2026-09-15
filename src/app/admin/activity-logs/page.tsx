import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ActivityLogsTable } from "@/components/admin/ActivityLogsTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface ActivityLogsPageProps {
  searchParams: Promise<{ action?: string; search?: string; page?: string; success?: string }>;
}

const LOGS_PER_PAGE = 20;

/** Verified against admin/activity-logs.php. */
export default async function ActivityLogsPage({ searchParams }: ActivityLogsPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "security", "view_logs")) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const actionFilter = params.action ?? "all";
  const search = (params.search ?? "").trim();
  const page = Math.max(1, Number(params.page) || 1);

  const where: Record<string, unknown> = {};
  if (actionFilter !== "all") where.actionType = actionFilter;
  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { ipAddress: { contains: search, mode: "insensitive" } },
      { user: { username: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [logs, totalLogs, existingActionsRaw] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { username: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: LOGS_PER_PAGE,
      skip: (page - 1) * LOGS_PER_PAGE,
    }),
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({ distinct: ["actionType"], select: { actionType: true }, orderBy: { actionType: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalLogs / LOGS_PER_PAGE));

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Activity Logs"
      pageSubtitle="Audit trail of every admin action"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success === "cleared" && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          Matching activity logs have been cleared.
        </div>
      )}

      <ActivityLogsTable
        logs={logs.map((l: (typeof logs)[number]) => ({
          id: l.id,
          username: l.user?.username ?? null,
          role: l.user?.role ?? null,
          actionType: l.actionType,
          description: l.description,
          ipAddress: l.ipAddress,
          createdAt: l.createdAt.toISOString(),
        }))}
        existingActions={existingActionsRaw.map((a: (typeof existingActionsRaw)[number]) => a.actionType)}
        actionFilter={actionFilter}
        search={search}
        page={page}
        totalPages={totalPages}
        totalLogs={totalLogs}
      />
    </AdminShell>
  );
}
