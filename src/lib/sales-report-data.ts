import { prisma } from "./db";
import type { RangeResult } from "./dashboard-range";
import { ORDER_STATUSES } from "./order-statuses";

export interface SalesReportData {
  sales: {
    orderNumber: string;
    itemsSummary: string;
    totalAmount: number;
    livePaid: number;
    liveDue: number;
    paymentMethod: string;
    orderType: string;
    createdAt: Date;
  }[];
  salesTotal: number;
  salesPaid: number;
  salesDue: number;
  byMethod: Record<string, number>;
  newDues: { customerName: string; orderNumber: string | null; amount: number; createdAt: Date }[];
  newDuesTotal: number;
  collections: { customerName: string; orderNumber: string | null; amount: number; paymentMethod: string; createdAt: Date }[];
  collectionsTotal: number;
  onlineCounts: Record<string, number>;
}

/** Verified 1:1 against the 4-query data-gathering block in
 *  admin/ecommerce/sales-report-print.php. */
export async function getSalesReportData(range: RangeResult, saleType: "all" | "offline" | "online"): Promise<SalesReportData> {
  const { rangeStart, rangeEnd } = range;

  const typeCondition =
    saleType === "offline"
      ? { orderType: "offline" }
      : saleType === "online"
      ? { orderType: "online", orderStatus: "Delivered" }
      : { OR: [{ orderType: "offline" }, { orderType: "online", orderStatus: "Delivered" }] };

  const [salesRaw, newDuesRaw, collectionsRaw, onlineOrders] = await Promise.all([
    prisma.ecomOrder.findMany({
      where: { ...typeCondition, createdAt: { gte: rangeStart, lte: rangeEnd } },
      orderBy: { createdAt: "asc" },
      include: { items: { select: { qty: true, productName: true } }, credits: { select: { amount: true, amountPaid: true }, take: 1 } },
    }),
    prisma.ecomCredit.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      orderBy: { createdAt: "asc" },
      include: { order: { select: { orderNumber: true } } },
    }),
    prisma.ecomCreditPayment.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      orderBy: { createdAt: "asc" },
      include: { credit: { select: { customerName: true, order: { select: { orderNumber: true } } } } },
    }),
    prisma.ecomOrder.findMany({
      where: { orderType: "online", createdAt: { gte: rangeStart, lte: rangeEnd } },
      select: { orderStatus: true },
    }),
  ]);

  let salesTotal = 0, salesPaid = 0, salesDue = 0;
  const byMethod: Record<string, number> = { Cash: 0, UPI: 0, Card: 0, Other: 0 };

  const sales = salesRaw.map((o: (typeof salesRaw)[number]) => {
    const total = Number(o.totalAmount);
    const credit = o.credits[0];
    let livePaid: number;
    if (credit) {
      const paidAtSale = total - Number(credit.amount);
      livePaid = Math.min(total, paidAtSale + Number(credit.amountPaid));
    } else {
      livePaid = o.paidAmount !== null ? Number(o.paidAmount) : total;
    }
    const liveDue = Math.max(0, total - livePaid);

    salesTotal += total;
    salesPaid += livePaid;
    salesDue += liveDue;
    const m = ["Cash", "UPI", "Card"].includes(o.paymentMethod) ? o.paymentMethod : "Other";
    byMethod[m] += total;

    return {
      orderNumber: o.orderNumber,
      itemsSummary: o.items.map((it: (typeof o.items)[number]) => `${it.qty}x ${it.productName}`).join(", "),
      totalAmount: total,
      livePaid,
      liveDue,
      paymentMethod: o.paymentMethod,
      orderType: o.orderType,
      createdAt: o.createdAt,
    };
  });

  const newDues = newDuesRaw.map((c: (typeof newDuesRaw)[number]) => ({
    customerName: c.customerName,
    orderNumber: c.order?.orderNumber ?? null,
    amount: Number(c.amount),
    createdAt: c.createdAt,
  }));
  const newDuesTotal = newDues.reduce((s: number, d: (typeof newDues)[number]) => s + d.amount, 0);

  const collections = collectionsRaw.map((cp: (typeof collectionsRaw)[number]) => ({
    customerName: cp.credit.customerName,
    orderNumber: cp.credit.order?.orderNumber ?? null,
    amount: Number(cp.amount),
    paymentMethod: cp.paymentMethod,
    createdAt: cp.createdAt,
  }));
  const collectionsTotal = collections.reduce((s: number, c: (typeof collections)[number]) => s + c.amount, 0);

  // Seeded from ORDER_STATUSES rather than a hardcoded literal: a status that
  // exists in the app but not in this map would be counted nowhere, and the
  // breakdown would quietly stop summing to the online order total.
  const onlineCounts: Record<string, number> = Object.fromEntries(ORDER_STATUSES.map((st) => [st, 0]));
  for (const oo of onlineOrders) {
    // A row holding a status retired from ORDER_STATUSES still has to appear,
    // or it would vanish from the report entirely.
    onlineCounts[oo.orderStatus] = (onlineCounts[oo.orderStatus] ?? 0) + 1;
  }

  return { sales, salesTotal, salesPaid, salesDue, byMethod, newDues, newDuesTotal, collections, collectionsTotal, onlineCounts };
}
