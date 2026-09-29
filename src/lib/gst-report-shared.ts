/** GST report periods and row shapes (browser-safe). India time; the financial year runs April → March. */

export type GstPeriod = "month" | "quarter" | "year" | "custom";
export type GstChannel = "all" | "offline" | "online";

export interface GstFilters { period: GstPeriod; month: string; quarter: string; fy: number; from: string; to: string; channel: GstChannel }

export interface GstRateRow { rate: number; taxable: number; cgst: number; sgst: number; tax: number; value: number; lines: number }
export interface GstHsnRow { hsn: string; description: string; uqc: string; qty: number; rate: number; taxable: number; cgst: number; sgst: number; tax: number; value: number }
export interface GstProductRow { productId: number; name: string; hsn: string; rate: number; qty: number; taxable: number; tax: number; value: number }
export interface GstInvoiceRow { id: number; number: string; date: string; customer: string; channel: string; taxable: number; cgst: number; sgst: number; tax: number; value: number }

export interface GstReport {
  filters: GstFilters;
  from: string; to: string; label: string;
  business: { name: string; gstin: string | null; address: string | null };
  totals: { invoices: number; taxable: number; cgst: number; sgst: number; tax: number; value: number };
  rates: GstRateRow[]; hsn: GstHsnRow[]; products: GstProductRow[]; invoices: GstInvoiceRow[];
}

const pad = (n: number) => String(n).padStart(2, "0");
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Financial year that a date falls in (FY 2025 = Apr 2025 – Mar 2026). */
export const fyOf = (ymd: string) => { const [y, m] = ymd.split("-").map(Number); return m >= 4 ? y : y - 1; };
export const fyLabel = (fy: number) => `FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** From / to (YYYY-MM-DD) and a label for the chosen period. Quarter is "2025-Q1" (Q1 = Apr–Jun of FY 2025). */
export function periodRange(f: Pick<GstFilters, "period" | "month" | "quarter" | "fy" | "from" | "to">): { from: string; to: string; label: string } {
  if (f.period === "month") {
    const [y, m] = f.month.split("-").map(Number);
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}`, label: `${MONTHS[m - 1]} ${y}` };
  }
  if (f.period === "quarter") {
    const [fyS, qS] = f.quarter.split("-Q");
    const fy = Number(fyS), q = Number(qS);
    const startM = 4 + (q - 1) * 3; // Apr, Jul, Oct, Jan
    const y = startM > 12 ? fy + 1 : fy, m = startM > 12 ? startM - 12 : startM;
    const endM = m + 2;
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(endM)}-${pad(lastDay(y, endM))}`, label: `Q${q} (${MONTHS[m - 1]}–${MONTHS[endM - 1]}) ${fyLabel(fy)}` };
  }
  if (f.period === "year") return { from: `${f.fy}-04-01`, to: `${f.fy + 1}-03-31`, label: fyLabel(f.fy) };
  const from = f.from <= f.to ? f.from : f.to, to = f.from <= f.to ? f.to : f.from;
  return { from, to, label: `${from} to ${to}` };
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
