import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { PaymentSaveError, savePaymentMethod2 } from "@/lib/payment2-save";
import { PAYMENT_METHODS } from "@/lib/payment-methods";

type Ctx = { params: Promise<{ key: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { key } = await ctx.params;
  const methodDef = PAYMENT_METHODS.find((m) => m.key === key);
  if (!methodDef) return NextResponse.json({ success: false, message: "Invalid payment method." }, { status: 400 });

  try {
    await savePaymentMethod2(key, await req.formData());
    await logActivity(req, session.userId, "ecom_payment_update", `Updated payment settings: ${methodDef.label}`);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof PaymentSaveError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
    console.error("payment-settings2 save failed", e);
    return NextResponse.json({ success: false, message: "Could not save this payment method. Please try again." }, { status: 500 });
  }
}

/** Quick enable/disable toggle from the list, no field changes. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { key } = await ctx.params;
  const methodDef = PAYMENT_METHODS.find((m) => m.key === key);
  if (!methodDef) return NextResponse.json({ success: false, message: "Invalid payment method." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.isEnabled !== "boolean") return NextResponse.json({ success: false, message: "Nothing to change." }, { status: 400 });

  const existing = await prisma.ecomPaymentSettings.findUnique({ where: { methodKey: key } });
  if (existing && !body.isEnabled && existing.isDefault) {
    // Can't leave the default method disabled — clear the flag too.
    await prisma.ecomPaymentSettings.update({ where: { methodKey: key }, data: { isEnabled: false, isDefault: false } });
  } else if (existing) {
    await prisma.ecomPaymentSettings.update({ where: { methodKey: key }, data: { isEnabled: body.isEnabled } });
  } else {
    if (!body.isEnabled) return NextResponse.json({ success: true }); // nothing to create for "disable" on a never-configured method
    await prisma.ecomPaymentSettings.create({ data: { methodKey: key, name: methodDef.label, isEnabled: true } });
  }

  await logActivity(req, session.userId, "ecom_payment_update", `${body.isEnabled ? "Enabled" : "Disabled"} payment method: ${methodDef.label}`);
  return NextResponse.json({ success: true });
}
