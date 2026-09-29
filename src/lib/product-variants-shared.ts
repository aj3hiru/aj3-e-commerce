/** Browser-safe helpers for product variants (no server imports here). */

export interface VariantProduct {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  quantity: number | null;
  unit: string | null;
  price: number;
  salePrice: number | null;
  stockQty: number | null;
  barcode: string | null;
  status: string;
  brand: string | null;
}

/** "1 KG", "250 Gram", "1.5 Liter" — or just the unit / null when there's no quantity. */
export function packLabel(quantity: number | string | null | undefined, unit: string | null | undefined): string | null {
  const q = quantity === null || quantity === undefined || quantity === "" ? null : Number(quantity);
  const u = (unit ?? "").trim();
  if (q === null || !Number.isFinite(q) || q <= 0) return u || null;
  const n = Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)));
  return u ? `${n} ${u}` : n;
}

/** Selling price and MRP of a variant (sale price wins when it's lower). */
export function variantPrices(v: Pick<VariantProduct, "price" | "salePrice">) {
  const mrp = v.price;
  const sell = v.salePrice !== null && v.salePrice > 0 && v.salePrice < mrp ? v.salePrice : mrp;
  const off = mrp > 0 && sell < mrp ? Math.round(((mrp - sell) / mrp) * 100) : 0;
  return { mrp, sell, off };
}

/** Converts a pack to a base amount so variants sort small → large (g/ml/cm scale ×1000 etc.). */
export function packSortKey(quantity: number | null, unit: string | null): number {
  if (quantity === null) return Number.MAX_SAFE_INTEGER;
  const u = (unit ?? "").toLowerCase();
  const big = ["kg", "liter", "litre", "l", "meter", "m"].includes(u) ? 1000 : 1;
  return quantity * big;
}

/** Sizes typed as a bare number get the product's unit: "250" + Gram → "250 Gram". */
export function withUnit(label: string, unit: string): string {
  const t = label.trim();
  return unit && /^\d+(\.\d+)?$/.test(t) ? `${t} ${unit}` : t;
}

/** The number part of a size label saved with this unit ("250 Gram" → "250"), else the label. */
export function withoutUnit(label: string, unit: string): string {
  if (!unit) return label;
  const m = label.trim().match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
  return m && m[2].toLowerCase() === unit.toLowerCase() ? m[1] : label;
}

const UNIT_WORDS: [RegExp, string][] = [
  [/^(kg|kgs|kilo|kilogram|kilograms)$/i, "KG"], [/^(g|gm|gms|gram|grams|grm)$/i, "g"], [/^(l|lt|ltr|litre|liter|litres|liters)$/i, "L"],
  [/^(ml|mls)$/i, "ml"], [/^(pc|pcs|piece|pieces|nos)$/i, "Pcs"], [/^(m|mtr|meter|metre)$/i, "m"], [/^(cm)$/i, "cm"], [/^(tab|tabs|tablets?)$/i, "Tablets"], [/^(caps?|capsules?)$/i, "Capsules"],
];

/** "Clinic Plus Shampoo 80ml" → "80 ml" (the size written in a product name), or null. */
export function packFromName(name: string): string | null {
  const m = [...name.matchAll(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|kilo|gms?|grams?|grm|g|litres?|liters?|ltr|lt|l|mls?|pcs|pc|pieces?|nos|mtr|metre|meter|m|cm|tabs?|tablets?|caps?|capsules?)\b/gi)].pop();
  if (!m) return null;
  const unit = UNIT_WORDS.find(([re]) => re.test(m[2]))?.[1] ?? m[2];
  return `${Number(m[1])} ${unit}`;
}

/** The short size shown on a variant tile: its quantity + unit, else the size in its name, else its first size, else its unit. */
export function variantLabel(v: { quantity: number | null; unit: string | null; name: string; sizeLabel?: string | null }): string {
  if (v.quantity !== null && v.quantity > 0) return packLabel(v.quantity, v.unit) ?? v.name;
  return packFromName(v.name) ?? v.sizeLabel ?? (v.unit?.trim() || "Option");
}
