import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";

/** Verified against activity-logs.php's clear_filtered action: deletes exactly
 *  the set of logs matching the currently-applied action/search filter, then
 *  logs the clear itself as a new 'logs_clear' entry. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "security", "view_logs")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const actionFilter = (body.action ?? "all").trim();
  const search = (body.search ?? "").trim();

  const where: Record<string, unknown> = {};
  if (actionFilter !== "all") where.actionType = actionFilter;
  if (search) {
    where.OR = [
      { description: { contains: search } },
      { ipAddress: { contains: search } },
      { user: { username: { contains: search } } },
    ];
  }

  try {
    const result = await prisma.activityLog.deleteMany({ where });

    const scopeBits: string[] = [];
    if (actionFilter !== "all") scopeBits.push(`action=${actionFilter}`);
    if (search) scopeBits.push(`search="${search}"`);
    const scopeLabel = scopeBits.length ? scopeBits.join(", ") : "all logs";

    await logActivity(req, session.userId, "logs_clear", `Cleared activity logs (${scopeLabel}) — ${result.count} entries removed`);

    return NextResponse.json({ success: true, redirect: "/admin/activity-logs?success=cleared" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unexpected error";
    return NextResponse.json({ success: false, message: `Clear failed: ${message}` }, { status: 500 });
  }
}
