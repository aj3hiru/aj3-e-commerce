import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { saveInvoiceSettings } from "@/lib/invoice-settings";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

/** Business Settings → Invoice Settings. */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ success: false, message: "Invalid settings." }, { status: 400 });
  try {
    const value = await saveInvoiceSettings(body);
    await logActivity(req, session.userId, "invoice_settings", "Updated invoice settings").catch(() => {});
    return NextResponse.json({ success: true, value });
  } catch {
    return NextResponse.json({ success: false, message: "Invoice settings couldn't be saved." }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
