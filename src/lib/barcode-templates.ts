import { prisma } from "@/lib/db";
import { cached, invalidateModel } from "@/lib/cache";

/** A saved label setup (what shows + size / layout) with a name, shared by every computer. */
export interface BarcodeTemplate { id: string; name: string; options: Record<string, unknown>; updatedAt: string }

const KEY = "barcode_templates";

function clean(v: unknown): BarcodeTemplate[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t) => t && typeof t === "object" && typeof t.id === "string" && typeof t.name === "string" && t.options && typeof t.options === "object")
    .slice(0, 50)
    .map((t) => ({ id: String(t.id).slice(0, 40), name: String(t.name).slice(0, 60), options: t.options as Record<string, unknown>, updatedAt: String(t.updatedAt ?? "") }));
}

export function getBarcodeTemplates(): Promise<BarcodeTemplate[]> {
  return cached("barcode-templates", ["StorefrontSetting"], 60_000, async () => {
    try {
      const row = await prisma.storefrontSetting.findUnique({ where: { key: KEY } });
      return clean(row?.value);
    } catch {
      return [];
    }
  });
}

export async function saveBarcodeTemplates(list: BarcodeTemplate[]): Promise<BarcodeTemplate[]> {
  const value = clean(list);
  await prisma.storefrontSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as unknown as object }, update: { value: value as unknown as object } });
  invalidateModel("StorefrontSetting");
  return value;
}
