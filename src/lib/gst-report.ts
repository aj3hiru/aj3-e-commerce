import { prisma } from "@/lib/db";
import { getBusinessRow } from "@/lib/business-row";
import { fyOf, periodRange, r2, type GstChannel, type GstFilters, type GstHsnRow, type GstInvoiceRow, type GstPeriod, type GstProductRow, type GstRateRow, type GstReport } from "@/lib/gst-report-shared";

export * from "@/lib/gst-report-shared";

const IST = 330 * 60 * 1000;
const todayYmd = () => new Date(Date.now() + IST).toISOString().slice(0, 10);
const ymdOk = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseGstFilters(sp: Record<string, string | undefined>): GstFilters {
  const today = todayYmd();
  const period = (["month", "quarter", "year", "custom"] as GstPeriod[]).includes(sp.period as GstPeriod) ? (sp.period as GstPeriod) : "month";
  const fy = /^\d{4}$/.test(sp.fy ?? "") ? Number(sp.fy) : fyOf(today);
  const m = Number(today.slice(5, 7));
  const curQ = `${fyOf(today)}-Q${m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4}`;
  return {
    period,
    month: /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7),
    quarter: /^\d{4}-Q[1-4]$/.test(sp.quarter ?? "") ? sp.quarter! : curQ,
    fy,
    from: ymdOk(sp.from) ? sp.from! : `${today.slice(0, 7)}-01`,
    to: ymdOk(sp.to) ? sp.to! : today,
    channel: (["all", "offline", "online"] as GstChannel[]).includes(sp.channel as GstChannel) ? (sp.channel as GstChannel) : "all",
  };
}

/**
 * Sales GST for a period: store bills, plus online orders once delivered
 * (cancelled ones never count). The taxable value is worked back from the
 * GST charged on each line, so it is right whether prices included GST or not
 * and after any coupon discount. Intra-state sale: CGST = SGST = half.
 */
export async function buildGstReport(f: GstFilters): Promise<GstReport> {
  const { from, to, label } = periodRange(f);
  const [orders, b] = await Promise.all([
    prisma.ecomOrder.findMany({
      where: {
        createdAt: { gte: new Date(`${from}T00:00:00.000+05:30`), lte: new Date(`${to}T23:59:59.999+05:30`) },
        NOT: { orderStatus: "Canceled" },
        OR: [{ orderType: "offline" }, { orderType: "online", orderStatus: "Delivered" }],
        ...(f.channel !== "all" ? { orderType: f.channel } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, orderNumber: true, createdAt: true, customerName: true, orderType: true, subtotalAmount: true, discountAmount: true,
        items: { select: { productId: true, productName: true, hsnCode: true, qty: true, price: true, gstRate: true, gstAmount: true, product: { select: { hsnCode: true, unit: true } } } },
      },
      take: 50_000,
    }),
    getBusinessRow(),
  ]);

  const rates = new Map<number, GstRateRow>();
  const hsn = new Map<string, GstHsnRow>();
  const products = new Map<string, GstProductRow>();
  const invoices: GstInvoiceRow[] = [];

  type Item = { productId: number; productName: string; hsnCode: string | null; qty: number; price: unknown; gstRate: unknown; gstAmount: unknown; product: { hsnCode: string | null; unit: string | null } | null };
  type Order = { id: number; orderNumber: string; createdAt: Date; customerName: string | null; orderType: string; subtotalAmount: unknown; discountAmount: unknown; items: Item[] };
  for (const o of orders as Order[]) {
    const sub = o.items.reduce((n, it) => n + Number(it.price) * it.qty, 0) || Number(o.subtotalAmount);
    const disc = Math.min(Number(o.discountAmount) || 0, sub);
    const inv = { taxable: 0, tax: 0 };
    for (const it of o.items) {
      const rate = Number(it.gstRate) || 0;
      const tax = Number(it.gstAmount) || 0;
      const line = Number(it.price) * it.qty;
      const afterDisc = sub > 0 ? line - disc * (line / sub) : line;
      const taxable = rate > 0 && tax > 0 ? (tax * 100) / rate : Math.max(0, afterDisc);
      const value = taxable + tax;
      inv.taxable += taxable; inv.tax += tax;

      const rr = rates.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, tax: 0, value: 0, lines: 0 };
      rr.taxable += taxable; rr.tax += tax; rr.value += value; rr.lines++;
      rates.set(rate, rr);

      const code = (it.hsnCode || it.product?.hsnCode || "").trim() || "—";
      const hk = `${code}|${rate}`;
      const hr = hsn.get(hk) ?? { hsn: code, description: it.productName, uqc: (it.product?.unit || "NOS").toUpperCase(), qty: 0, rate, taxable: 0, cgst: 0, sgst: 0, tax: 0, value: 0 };
      hr.qty += it.qty; hr.taxable += taxable; hr.tax += tax; hr.value += value;
      hsn.set(hk, hr);

      const pk = `${it.productId}|${rate}`;
      const pr = products.get(pk) ?? { productId: it.productId, name: it.productName, hsn: code, rate, qty: 0, taxable: 0, tax: 0, value: 0 };
      pr.qty += it.qty; pr.taxable += taxable; pr.tax += tax; pr.value += value;
      products.set(pk, pr);
    }
    invoices.push({
      id: o.id, number: o.orderNumber, date: o.createdAt.toISOString(), customer: o.customerName || "Walk-in", channel: o.orderType === "online" ? "Online" : "Store",
      taxable: r2(inv.taxable), cgst: r2(inv.tax / 2), sgst: r2(inv.tax / 2), tax: r2(inv.tax), value: r2(inv.taxable + inv.tax),
    });
  }

  const fin = <T extends { taxable: number; tax: number; value: number; cgst?: number; sgst?: number }>(x: T): T =>
    ({ ...x, taxable: r2(x.taxable), tax: r2(x.tax), value: r2(x.value), ...("cgst" in x ? { cgst: r2(x.tax / 2), sgst: r2(x.tax / 2) } : {}) });
  const totTaxable = invoices.reduce((n, i) => n + i.taxable, 0), totTax = invoices.reduce((n, i) => n + i.tax, 0);
  return {
    filters: f, from, to, label,
    business: { name: b?.businessName ?? "My Store", gstin: b?.gstin ?? null, address: b?.address ?? null },
    totals: { invoices: invoices.length, taxable: r2(totTaxable), cgst: r2(totTax / 2), sgst: r2(totTax / 2), tax: r2(totTax), value: r2(totTaxable + totTax) },
    rates: [...rates.values()].map(fin).sort((a, b) => a.rate - b.rate),
    hsn: [...hsn.values()].map(fin).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate),
    products: [...products.values()].map(fin).sort((a, b) => b.value - a.value),
    invoices: invoices.reverse(),
  };
}
