import { prisma } from "@/lib/db";

export interface CouponActivityRow {
  id: number;
  action: "create" | "update" | "delete" | "pause" | "resume";
  description: string;
  byUsername: string | null;
  createdAt: string; // ISO
}

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
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}
