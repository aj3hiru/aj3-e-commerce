import { prisma } from "@/lib/db";

export class TaxRateSaveError extends Error {
  constructor(message: string, public field?: string, public status = 400) {
    super(message);
  }
}

export interface TaxRate2Input { label: string; rate: number }

export function parseTaxRate2Input(body: Record<string, unknown>): TaxRate2Input {
  const label = String(body.label ?? "").trim();
  const rate = Number(body.rate);
  if (!label) throw new TaxRateSaveError("Label is required.", "label");
  if (label.length > 100) throw new TaxRateSaveError("Label is too long (100 characters max).", "label");
  if (!Number.isFinite(rate) || rate < 0) throw new TaxRateSaveError("Rate must be a positive number.", "rate");
  if (rate > 100) throw new TaxRateSaveError("Rate can't exceed 100%.", "rate");
  return { label, rate: Math.round(rate * 100) / 100 };
}

export async function createTaxRate2(input: TaxRate2Input) {
  const count = await prisma.ecomGstRate.count();
  return prisma.ecomGstRate.create({ data: { ...input, isDefault: count === 0 } }); // first slab created becomes default automatically
}

export async function updateTaxRate2(id: number, input: TaxRate2Input) {
  const existing = await prisma.ecomGstRate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new TaxRateSaveError("This GST slab no longer exists.", undefined, 404);
  return prisma.ecomGstRate.update({ where: { id }, data: input });
}
