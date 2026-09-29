import { NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { listPushOffers } from "@/lib/push-offers";
import { withApiErrors } from "@/lib/api-errors";

/** Push → Compose → "Offer": live campaigns and coupons. */
async function handleGET() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "send")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  return NextResponse.json({ success: true, offers: await listPushOffers() });
}

export const GET = withApiErrors(handleGET);
