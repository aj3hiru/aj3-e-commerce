import { prisma } from "./db";
import type { RangeResult } from "./dashboard-range";

export interface DashboardStats {
  // Online Platform
  onTotal: number;
  onPending: number;
  onProgress: number;
  onDelivered: number;
  onCanceled: number;
  onCustomers: number;
  offCustomers: number;
  // Earnings & Due
  periodEarning: number;
  pmCash: number;
  pmUpi: number;
  pmCard: number;
  periodNewDue: number;
  periodDueCollection: number;
  periodDuePromise: number;
  // Store Overview
  totalProducts: number;
  totalCategories: number;
  totalBrands: number;
  outOfStock: number;
  periodCustomers: number;
  periodNewCustomers: number;
  periodReviewsToday: number;
  periodReviewsTotal: number;
  activeCoupons: number;
  // Recent orders
  recentOrders: RecentOrder[];
}

export interface RecentOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  itemsSummary: string;
  totalAmount: number;
  paymentStatus: string;
  orderStatus: string;
  createdAt: Date;
}

/**
 * Verified 1:1 against every scalar($pdo, "SELECT ...") call in admin/dashboard.php.
 * Uses Prisma's count()/aggregate() in place of raw SQL, but the WHERE conditions
 * (date ranges, order_type, status filters) match exactly.
 */
export async function getDashboardStats(range: RangeResult): Promise<DashboardStats> {
  const { rangeStart, rangeEnd, dateFrom, dateTo } = range;
  const dateOnlyStart = new Date(dateFrom);
  const dateOnlyEnd = new Date(dateTo);

  const [
    onTotal, onPending, onProgress, onDelivered, onCanceled, onCustomers, offCustomers,
    earningAgg, cashAgg, upiAgg, cardAgg,
    newDueAgg, dueCollectionAgg, duePromiseCredits,
    totalProducts, totalCategories, totalBrands, outOfStock,
    periodCustomers, periodReviews, activeCoupons,
    recentOrdersRaw,
  ] = await Promise.all([
    prisma.ecomOrder.count({ where: { orderType: "online", createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "Pending", createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "In Progress", createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "Delivered", createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "Canceled", createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomCustomer.count({ where: { customerType: "online", createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomCustomer.count({ where: { customerType: "offline", createdAt: { gte: rangeStart, lte: rangeEnd } } }),

    prisma.ecomOrder.aggregate({ _sum: { totalAmount: true }, where: { paymentStatus: "Paid", createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomOrder.aggregate({ _sum: { totalAmount: true }, where: { paymentMethod: "Cash", createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomOrder.aggregate({ _sum: { totalAmount: true }, where: { paymentMethod: "UPI", createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomOrder.aggregate({ _sum: { totalAmount: true }, where: { paymentMethod: "Card", createdAt: { gte: rangeStart, lte: rangeEnd } } }),

    prisma.ecomCredit.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomCreditPayment.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    // "Due Promise": pending credits whose promised_date falls within the selected
    // date range (date-only comparison, not datetime — matches the PHP's use of
    // $date_from/$date_to rather than $range_start/$range_end for this one query).
    prisma.ecomCredit.findMany({
      where: { status: "pending", promisedDate: { gte: dateOnlyStart, lte: dateOnlyEnd } },
      select: { amount: true, amountPaid: true },
    }),

    prisma.ecomProduct.count(),
    prisma.ecomCategory.count(),
    prisma.ecomBrand.count(),
    prisma.ecomProduct.count({ where: { productType: "physical", OR: [{ stockQty: null }, { stockQty: { lte: 0 } }] } }),

    prisma.ecomCustomer.count({ where: { createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomProductReview.count({ where: { createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.ecomCoupon.count({ where: { status: "active" } }),

    prisma.ecomOrder.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { items: { select: { qty: true, productName: true } } },
    }),
  ]);

  const periodDuePromise = duePromiseCredits.reduce(
    (sum: number, c: (typeof duePromiseCredits)[number]) => sum + (Number(c.amount) - Number(c.amountPaid)),
    0
  );

  const recentOrders: RecentOrder[] = recentOrdersRaw.map((o: (typeof recentOrdersRaw)[number]) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName || "—",
    itemsSummary: o.items.length
      ? o.items.map((it: (typeof o.items)[number]) => `${it.qty}x ${it.productName}`).join(", ")
      : "—",
    totalAmount: Number(o.totalAmount),
    paymentStatus: o.paymentStatus,
    orderStatus: o.orderStatus,
    createdAt: o.createdAt,
  }));

  return {
    onTotal, onPending, onProgress, onDelivered, onCanceled, onCustomers, offCustomers,
    periodEarning: Number(earningAgg._sum.totalAmount ?? 0),
    pmCash: Number(cashAgg._sum.totalAmount ?? 0),
    pmUpi: Number(upiAgg._sum.totalAmount ?? 0),
    pmCard: Number(cardAgg._sum.totalAmount ?? 0),
    periodNewDue: Number(newDueAgg._sum.amount ?? 0),
    periodDueCollection: Number(dueCollectionAgg._sum.amount ?? 0),
    periodDuePromise,
    totalProducts, totalCategories, totalBrands, outOfStock,
    periodCustomers,
    periodNewCustomers: periodCustomers, // PHP computes the identical query twice under two names
    periodReviewsToday: periodReviews,
    periodReviewsTotal: periodReviews, // same query, same duplication as the PHP version
    activeCoupons,
    recentOrders,
  };
}
