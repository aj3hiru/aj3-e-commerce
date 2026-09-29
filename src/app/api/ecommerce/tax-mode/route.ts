import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveTaxMode } from "@/lib/tax-mode";
import { withApiErrors } from "@/lib/api-errors";

/** GST / Tax Settings → "Prices include GST" or "GST added on top". */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ success: false, message: "Invalid data." }, { status: 400 });
  const mode = await saveTaxMode(body);
  await logActivity(req, session.userId, "tax_mode_update", mode.pricesIncludeTax ? "Prices now include GST" : "GST now added on top of prices");
  return NextResponse.json({ success: true, mode });
}

export const POST = withApiErrors(handlePOST);
