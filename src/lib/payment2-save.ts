import { prisma } from "@/lib/db";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { saveUploadedImage, deleteUploadedImage } from "@/lib/upload";

export class PaymentSaveError extends Error {
  constructor(message: string, public field?: string, public status = 400) {
    super(message);
  }
}

/** Upsert one gateway's settings — same shape the v1 page already writes
 *  (ecom_payment_settings.config is a JSON blob of that method's own
 *  fields, per lib/payment-methods.ts), plus the new is_default flag. */
export async function savePaymentMethod2(methodKey: string, form: FormData) {
  const methodDef = PAYMENT_METHODS.find((m) => m.key === methodKey);
  if (!methodDef) throw new PaymentSaveError("Invalid payment method.", undefined, 400);

  const name = String(form.get("name") ?? methodDef.label).trim() || methodDef.label;
  const text = String(form.get("text") ?? "").trim();
  const isEnabled = form.get("is_enabled") === "1";

  const config: Record<string, string> = {};
  for (const field of methodDef.fields) {
    config[field.key] = String(form.get(`field_${field.key}`) ?? "").trim();
  }
  // A gateway can't be turned on with required fields still blank —
  // COD has no fields at all, so it's always considered configured.
  if (isEnabled && methodDef.fields.length > 0 && methodDef.fields.some((f) => !config[f.key])) {
    throw new PaymentSaveError("Fill in every field before enabling this method.", "config");
  }

  const photo = form.get("photo");
  const file = photo instanceof File && photo.size > 0 ? photo : null;
  let imagePath: string | undefined;
  if (file) {
    const existing = await prisma.ecomPaymentSettings.findUnique({ where: { methodKey }, select: { image: true } });
    if (existing?.image) await deleteUploadedImage(existing.image);
    imagePath = await saveUploadedImage(file, "ecommerce/payment", methodKey);
  }

  return prisma.ecomPaymentSettings.upsert({
    where: { methodKey },
    create: { methodKey, name, text, config, isEnabled, ...(imagePath ? { image: imagePath } : {}) },
    update: { name, text, config, isEnabled, ...(imagePath ? { image: imagePath } : {}) },
  });
}

/** Sets exactly one method as the default (checkout pre-selection) — clears
 *  the flag on every other row first, in a transaction, so two never end up
 *  default at once. */
export async function setDefaultPaymentMethod2(methodKey: string) {
  const methodDef = PAYMENT_METHODS.find((m) => m.key === methodKey);
  if (!methodDef) throw new PaymentSaveError("Invalid payment method.", undefined, 400);
  const existing = await prisma.ecomPaymentSettings.findUnique({ where: { methodKey }, select: { isEnabled: true } });
  if (!existing?.isEnabled) throw new PaymentSaveError("Enable this method before making it the default.", undefined, 409);

  await prisma.$transaction([
    prisma.ecomPaymentSettings.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma.ecomPaymentSettings.upsert({
      where: { methodKey },
      create: { methodKey, name: methodDef.label, isEnabled: true, isDefault: true },
      update: { isDefault: true },
    }),
  ]);
}
