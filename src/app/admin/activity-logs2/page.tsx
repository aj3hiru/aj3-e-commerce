import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { ActivityLogs2Body, type LogRow2 } from "@/components/admin/activity-logs2/ActivityLogs2Body";
import { ACTIVITYLOGS2_GROUPS, ACTIVITYLOGS2_PREF_KEY, ACTIVITYLOGS2_STANDALONE } from "@/components/admin/activity-logs2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 25;
// Same buckets lib/activity-logs2.ts uses, mirrored here as literal lists so
// they can be pushed into a Prisma `actionType: { in: [...] }` where-clause
// (severity itself isn't a stored column, so filtering by it means filtering
// by the set of actionTypes that classify into it).
const HIGH_TYPES = ["login_blocked", "login_denied", "logs_clear", "user_delete", "ecom_product_delete", "ecom_category_delete", "ecom_customer_delete", "ecom_coupon_delete", "ecom_brand_delete", "ecom_subcategory_delete", "ecom_tag_delete", "ecom_campaign_delete", "ecom_review_delete"];
const MEDIUM_TYPES = ["user_create", "user_edit", "ecom_payment_update", "ecom_business_settings_update", "ecom_homepage_update", "ecom_coupon_pause", "ecom_coupon_resume", "ecom_gst_update", "ecom_product_stock_update"];
const SECURITY_TYPES = ["login_success", "login_blocked", "login_denied", "logs_clear", "user_create", "user_delete", "user_edit"];
const FAILED_TYPES = ["login_blocked", "login_denied"];

/**
 * /admin/activity-logs2 — a trial redesign of Activity Logs, kept alongside
 * /admin/activity-logs so the two can be compared. Same access rule
 * (security.view_logs), same activity_logs table, plus the same
 * /api/activity-logs/clear endpoint (unchanged — it already works from any
 * filter shape).
 *
 * "Severity" and the parsed Browser/OS are DERIVED display values, not new
 * schema — activity_logs has no severity column, so severity is a fixed
 * classification of the real actionType (see lib/activity-logs2.ts), and
 * Browser/OS is parsed from the real stored user_agent string. Geolocation,
 * a session ID and a request ID are NOT shown — nothing in this schema
 * tracks them, and inventing plausible-looking values for a security/audit
 * page would be actively misleading rather than a harmless placeholder.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/activity-logs2/
 *   src/components/admin/activity-logs2/
 *   src/lib/activity-logs2.ts
 * (/api/activity-logs/clear stays — the original page still uses it.)
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ActivityLogs2Page({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "security", "view_logs")) {
    redirect("/shop/login");
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const action = one(sp.action) || "all";
  const user = one(sp.user) || "all";
  const severity = one(sp.severity) || "all";
  const search = one(sp.search).trim();
  const dateFrom = one(sp.dateFrom);
  const dateTo = one(sp.dateTo);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const where: Record<string, unknown> = {};
  if (action !== "all") where.actionType = action;
  if (user !== "all") where.user = { username: user };
  if (severity === "high") where.actionType = { in: HIGH_TYPES };
  else if (severity === "medium") where.actionType = { in: MEDIUM_TYPES };
  else if (severity === "low") where.actionType = { notIn: [...HIGH_TYPES, ...MEDIUM_TYPES] };
  if (search) {
    where.OR = [
      { description: { contains: search } },
      { ipAddress: { contains: search } },
      { user: { username: { contains: search } } },
    ];
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {}),
    };
  }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);

  const [logsRaw, totalLogs, distinctActionsRaw, distinctUsersRaw, total, today, security, failed] = await Promise.all([
    prisma.activityLog.findMany({ where, include: { user: { select: { username: true, email: true, role: true } } }, orderBy: { createdAt: "desc" }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({ distinct: ["actionType"], select: { actionType: true }, orderBy: { actionType: "asc" } }),
    prisma.user.findMany({ where: { activityLogs: { some: {} } }, select: { username: true, email: true }, orderBy: { username: "asc" } }),
    prisma.activityLog.count(),
    prisma.activityLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.activityLog.count({ where: { actionType: { in: SECURITY_TYPES } } }),
    prisma.activityLog.count({ where: { actionType: { in: FAILED_TYPES }, createdAt: { gte: dayAgo } } }),
  ]);

  const logs: LogRow2[] = (logsRaw as {
    id: number; actionType: string; description: string; ipAddress: string | null; userAgent: string | null;
    createdAt: Date; user: { username: string; email: string; role: string } | null;
  }[]).map((l) => ({
    id: l.id, username: l.user?.username ?? null, email: l.user?.email ?? null, role: l.user?.role ?? null,
    actionType: l.actionType, description: l.description, ipAddress: l.ipAddress, userAgent: l.userAgent,
    createdAt: l.createdAt.toISOString(),
  }));

  const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));

  return (
    <DashboardWidgetPrefsProvider prefKey={ACTIVITYLOGS2_PREF_KEY} groups={ACTIVITYLOGS2_GROUPS} standalone={ACTIVITYLOGS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Activity Logs"
        pageSubtitle="Monitor system activities and audit trail across EduMint24"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}
      >
        <div className="mb-5 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
        <ActivityLogs2Body
          logs={logs}
          stats={{ total, today, security, failed }}
          actions={(distinctActionsRaw as { actionType: string }[]).map((a) => a.actionType)}
          users={distinctUsersRaw as { username: string; email: string }[]}
          filters={{ action, user, severity, search, dateFrom, dateTo }}
          page={page} totalPages={totalPages} totalLogs={totalLogs} pageSize={PAGE_SIZE}
        />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
