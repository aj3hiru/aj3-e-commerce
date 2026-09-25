import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { PaymentSaveError, setDefaultPaymentMethod2 } from "@/lib/payment2-save";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { withApiErrors } from "@/lib/api-errors";

async function handlePOST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { key } = await ctx.params;
  const methodDef = PAYMENT_METHODS.find((m) => m.key === key);
  if (!methodDef) return NextResponse.json({ success: false, message: "Invalid payment method." }, { status: 400 });

  try {
    await setDefaultPaymentMethod2(key);
    await logActivity(req, session.userId, "ecom_payment_update", `Set default payment method: ${methodDef.label}`);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof PaymentSaveError) return NextResponse.json({ success: false, message: e.message }, { status: e.status });
    console.error("payment-settings2 set-default failed", e);
    return NextResponse.json({ success: false, message: "Could not set the default method. Please try again." }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
