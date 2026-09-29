import { prisma } from "@/lib/db";
import { cached, invalidateModel } from "@/lib/cache";
import { DEFAULT_TAX_MODE, sanitizeTaxMode, type TaxMode } from "@/lib/tax-mode-shared";

export * from "@/lib/tax-mode-shared";

const KEY = "tax_mode";

export function getTaxMode(): Promise<TaxMode> {
  return cached("tax-mode", ["StorefrontSetting"], 60_000, async () => {
    try {
      const row = await prisma.storefrontSetting.findUnique({ where: { key: KEY } });
      return sanitizeTaxMode(row?.value ?? DEFAULT_TAX_MODE);
    } catch {
      return DEFAULT_TAX_MODE;
    }
  });
}

export async function saveTaxMode(input: unknown): Promise<TaxMode> {
  const value = sanitizeTaxMode(input);
  await prisma.storefrontSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as unknown as object }, update: { value: value as unknown as object } });
  invalidateModel("StorefrontSetting");
  return value;
}
