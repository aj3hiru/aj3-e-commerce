import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { deleteCampaign } from "@/lib/push-manager2";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "send")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ success: false, error: "Invalid campaign id" }, { status: 400 });

  const campaign = await prisma.pushCampaign.findUnique({ where: { id }, select: { title: true } });
  if (!campaign) return NextResponse.json({ success: false, error: "This campaign no longer exists." }, { status: 404 });

  await deleteCampaign(id);
  await logActivity(req, session.userId, "push_campaign_delete", `Deleted push campaign: ${campaign.title} (ID: ${id})`);
  return NextResponse.json({ success: true });
}
