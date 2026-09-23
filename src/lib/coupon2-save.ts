import { prisma } from "@/lib/db";

export class CouponSaveError extends Error {
  constructor(message: string, public field?: string, public status = 400) {
    super(message);
  }
}

export interface Coupon2Input {
  title: string;
  code: string;
  numberOfTimes: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  appliesTo: "all" | "product" | "category" | "subcategory";
  productId: number | null;
  categoryId: number | null;
  subcategoryId: number | null;
  status: "active" | "inactive";
  isPaused: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

function parseDate(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseCoupon2Input(body: Record<string, unknown>): Coupon2Input {
  const title = String(body.title ?? "").trim();
  const code = String(body.code ?? "").trim().toUpperCase();
  const numberOfTimes = Math.max(1, Number(body.numberOfTimes ?? 1) || 1);
  const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
  const discountValue = Number(body.discountValue ?? 0);
  const appliesTo = ["all", "product", "category", "subcategory"].includes(body.appliesTo as string) ? (body.appliesTo as Coupon2Input["appliesTo"]) : "all";

  if (!title) throw new CouponSaveError("Title is required.", "title");
  if (!code) throw new CouponSaveError("Coupon code is required.", "code");
  if (!/^[A-Z0-9_-]{3,60}$/.test(code)) throw new CouponSaveError("Code must be 3–60 characters: letters, numbers, - or _.", "code");
  if (discountValue <= 0) throw new CouponSaveError("Discount must be greater than 0.", "discountValue");
  if (discountType === "percentage" && discountValue > 100) throw new CouponSaveError("A percentage discount can't exceed 100.", "discountValue");

  const productId = appliesTo === "product" ? Number(body.productId) || null : null;
  const categoryId = appliesTo === "category" ? Number(body.categoryId) || null : null;
  const subcategoryId = appliesTo === "subcategory" ? Number(body.subcategoryId) || null : null;
  if (appliesTo === "product" && !productId) throw new CouponSaveError("Please select a product for this coupon.", "productId");
  if (appliesTo === "category" && !categoryId) throw new CouponSaveError("Please select a category for this coupon.", "categoryId");
  if (appliesTo === "subcategory" && !subcategoryId) throw new CouponSaveError("Please select a sub-category for this coupon.", "subcategoryId");

  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  if (startsAt && endsAt && endsAt < startsAt) throw new CouponSaveError("End date can't be before the start date.", "endsAt");

  return {
    title, code, numberOfTimes, discountType, discountValue, appliesTo, productId, categoryId, subcategoryId,
    status: body.status === "inactive" ? "inactive" : "active",
    isPaused: body.isPaused === true,
    startsAt, endsAt,
  };
}

export async function createCoupon2(input: Coupon2Input) {
  const dup = await prisma.ecomCoupon.findFirst({ where: { code: input.code }, select: { id: true } });
  if (dup) throw new CouponSaveError("This coupon code is already in use. Please choose another.", "code", 409);
  return prisma.ecomCoupon.create({ data: input, select: { id: true, title: true, code: true } });
}

export async function updateCoupon2(id: number, input: Coupon2Input) {
  const existing = await prisma.ecomCoupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new CouponSaveError("This coupon no longer exists.", undefined, 404);
  const dup = await prisma.ecomCoupon.findFirst({ where: { code: input.code, NOT: { id } }, select: { id: true } });
  if (dup) throw new CouponSaveError("This coupon code is already in use. Please choose another.", "code", 409);
  return prisma.ecomCoupon.update({ where: { id }, data: input, select: { id: true, title: true, code: true } });
}
