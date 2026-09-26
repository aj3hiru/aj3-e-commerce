import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveDeliverySettings } from "@/lib/delivery-charge";
import { withApiErrors } from "@/lib/api-errors";

/** Business Settings → Delivery Charge. */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ success: false, message: "Invalid data." }, { status: 400 });
  const settings = await saveDeliverySettings(body);
  await logActivity(req, session.userId, "delivery_settings_update",
    settings.enabled ? `Delivery charge ₹${settings.charge}${settings.freeAbove !== null ? `, free from ₹${settings.freeAbove}` : ""}` : "Delivery charge turned off");
  return NextResponse.json({ success: true, settings });
}

export const POST = withApiErrors(handlePOST);
