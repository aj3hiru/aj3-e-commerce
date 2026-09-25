import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { withApiErrors } from "@/lib/api-errors";

/** Removes one subscriber (and its pending queue rows). */
async function handleDELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "Invalid subscriber id" }, { status: 400 });
  await prisma.$transaction([
    prisma.pushQueue.deleteMany({ where: { subscriptionId: id } }),
    prisma.pushSubscription.deleteMany({ where: { id } }),
  ]);
  return NextResponse.json({ success: true });
}

export const DELETE = withApiErrors(handleDELETE);
