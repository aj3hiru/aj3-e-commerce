import { prisma } from "./db";
import type { NextRequest } from "next/server";

/** Mirrors the activity_logs insert repeated across admin mutation endpoints in the PHP app. */
export async function logActivity(
  req: NextRequest,
  userId: number,
  actionType: string,
  description: string
) {
  const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  await prisma.activityLog.create({
    data: { userId, actionType, description, ipAddress, userAgent },
  });
}
