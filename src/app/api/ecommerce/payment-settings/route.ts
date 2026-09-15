import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveUploadedImage, deleteUploadedImage } from "@/lib/upload";
import { PAYMENT_METHODS } from "@/lib/payment-methods";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const form = await req.formData();
  const methodKey = form.get("method_key") as string | null;
  const methodDef = PAYMENT_METHODS.find((m) => m.key === methodKey);
  if (!methodDef) {
    return NextResponse.json({ success: false, message: "Invalid payment method." }, { status: 400 });
  }

  const name = ((form.get("name") as string | null) ?? methodDef.label).trim();
  const text = ((form.get("text") as string | null) ?? "").trim();
  const isEnabled = form.get("status") !== null;

  const config: Record<string, string> = {};
  for (const field of methodDef.fields) {
    config[field.key] = ((form.get(`pkey[${field.key}]`) as string | null) ?? "").trim();
  }

  const photoFile = form.get("photo") as File | null;
  let imagePath: string | undefined;
  if (photoFile && photoFile.size > 0) {
    const existing = await prisma.ecomPaymentSettings.findUnique({ where: { methodKey } });
    await deleteUploadedImage(existing?.image);
    imagePath = await saveUploadedImage(photoFile, "ecommerce/payment", methodKey!);
  }

  await prisma.ecomPaymentSettings.upsert({
    where: { methodKey: methodKey! },
    create: { methodKey: methodKey!, name, text, config, isEnabled, ...(imagePath ? { image: imagePath } : {}) },
    update: { name, text, config, isEnabled, ...(imagePath ? { image: imagePath } : {}) },
  });

  await logActivity(req, session.userId, "ecom_payment_update", `Updated payment settings: ${methodDef.label}`);

  return NextResponse.json({ success: true, redirect: `/admin/ecommerce/payment-settings?method=${methodKey}&success=1` });
}
