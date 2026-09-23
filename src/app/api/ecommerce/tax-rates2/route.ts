import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { TaxRateSaveError, createTaxRate2, parseTaxRate2Input } from "@/lib/tax2-save";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  try {
    const input = parseTaxRate2Input(await req.json().catch(() => ({})));
    const r = await createTaxRate2(input);
    await logActivity(req, session.userId, "ecom_gst_create", `Created GST slab: ${r.label} (${Number(r.rate)}%) (ID: ${r.id})`);
    return NextResponse.json({ success: true, id: r.id, label: r.label });
  } catch (e) {
    if (e instanceof TaxRateSaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("tax-rates2 create failed", e);
    return NextResponse.json({ success: false, message: "Could not save this GST slab. Please try again." }, { status: 500 });
  }
}
