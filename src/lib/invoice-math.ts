import type { InvoiceData } from "@/lib/invoice-data";

/** GST summary by rate, scaled so it adds up to the order's own GST total (discounts included). */
export function taxSummary(data: Pick<InvoiceData, "items" | "totalGst">) {
  const by = new Map<number, { taxable: number; tax: number }>();
  for (const it of data.items) {
    if (!(it.gstRate > 0)) continue;
    const taxable = it.price * it.qty;
    const row = by.get(it.gstRate) ?? { taxable: 0, tax: 0 };
    row.taxable += taxable; row.tax += (taxable * it.gstRate) / 100;
    by.set(it.gstRate, row);
  }
  const raw = [...by.values()].reduce((n, r) => n + r.tax, 0);
  const k = raw > 0 && data.totalGst > 0 ? data.totalGst / raw : 1;
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([rate, r]) => ({ rate, taxable: r.taxable, tax: r.tax * k }));
}

export const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
export const invDate = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const invTime = (d: Date | string) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
