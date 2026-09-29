import { prisma } from "@/lib/db";
import type { CouponActivityRow } from "@/lib/coupons2-activity-shared";

export * from "@/lib/coupons2-activity-shared";


const ACTION_MAP: Record<string, CouponActivityRow["action"]> = {
  ecom_coupon_create: "create",
  ecom_coupon_update: "update",
  ecom_coupon_delete: "delete",
  ecom_coupon_pause: "pause",
  ecom_coupon_resume: "resume",
};

/** The last N coupon-related entries from the real activity_logs table — the
 *  same audit trail every other admin mutation writes to (see lib/activity-log.ts).
 *  Nothing here is synthesized: if a coupon has no logged activity yet
 *  (created before this page existed, say), it simply doesn't appear. */
export async function getCouponActivity(limit = 12): Promise<CouponActivityRow[]> {
  const rows = await prisma.activityLog.findMany({
    where: { actionType: { in: Object.keys(ACTION_MAP) } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, actionType: true, description: true, createdAt: true, user: { select: { username: true } } },
  });
  return (rows as { id: number; actionType: string; description: string; createdAt: Date; user: { username: string } }[])
    .map((r) => ({
      id: r.id,
      action: ACTION_MAP[r.actionType] ?? "update",
      description: r.description,
      byUsername: r.user?.username ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
}

/** "2m ago", "1h ago", "3d ago" — matches the relative-time style used
 *  throughout the "2" pages' activity feeds. */
