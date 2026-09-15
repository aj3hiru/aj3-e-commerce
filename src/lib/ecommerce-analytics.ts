import { prisma } from "./db";
import type { RangeResult } from "./dashboard-range";

export interface TopProductRow {
  productId: number;
  name: string;
  image: string | null;
  unitsSold: number;
  revenue: number;
  orderCount: number;
}

export interface CategoryBreakdownRow {
  categoryId: number | null;
  categoryName: string;
  revenue: number;
  unitsSold: number;
}

export interface DailyRevenuePoint {
  date: string; // YYYY-MM-DD
  revenue: number;
  orderCount: number;
}

export interface LowStockRow {
  productId: number;
  name: string;
  stockQty: number | null;
  price: number;
}

export interface EcommerceAnalyticsData {
  topProducts: TopProductRow[];
  worstProducts: TopProductRow[];
  categoryBreakdown: CategoryBreakdownRow[];
  dailyRevenue: DailyRevenuePoint[];
  lowStockProducts: LowStockRow[];
  totalRevenue: number;
  totalUnitsSold: number;
  totalOrders: number;
  avgOrderValue: number;
  newVsReturningCustomers: { newCustomers: number; returningCustomers: number };
}

/**
 * Ecommerce analytics for the given date range. Built entirely on tables already
 * verified elsewhere in this project (ecom_orders, ecom_order_items, ecom_products,
 * ecom_categories, ecom_customers) — no new schema was needed. Product-level
 * numbers (units sold, revenue, order count) are derived from EcomOrderItem rows,
 * which store a price/qty SNAPSHOT at time of sale (see schema.prisma comments),
 * so historical analytics stay accurate even if a product's price changes later.
 */
export async function getEcommerceAnalytics(range: RangeResult, orderTypeFilter: "all" | "online" | "offline" = "all"): Promise<EcommerceAnalyticsData> {
  const { rangeStart, rangeEnd } = range;
  const typeWhere = orderTypeFilter === "all" ? {} : { orderType: orderTypeFilter };

  const orderWhere = { ...typeWhere, createdAt: { gte: rangeStart, lte: rangeEnd } };

  const [orderItems, orders, allProducts, lowStock, customersInRange] = await Promise.all([
    prisma.ecomOrderItem.findMany({
      where: { order: orderWhere },
      include: { product: { select: { id: true, name: true, image: true, categoryId: true, category: { select: { name: true } } } } },
    }),
    prisma.ecomOrder.findMany({ where: orderWhere, select: { id: true, totalAmount: true, createdAt: true, customerId: true } }),
    prisma.ecomProduct.count(),
    prisma.ecomProduct.findMany({
      where: { productType: "physical", status: "active", OR: [{ stockQty: { lte: 5 } }] },
      orderBy: { stockQty: "asc" },
      take: 10,
      select: { id: true, name: true, stockQty: true, price: true },
    }),
    prisma.ecomCustomer.findMany({
      where: { orders: { some: orderWhere } },
      select: { id: true, createdAt: true },
    }),
  ]);

  // ── Per-product aggregation ──────────────────────────────────────────────
  const productMap = new Map<number, TopProductRow & { orderIds: Set<number> }>();
  for (const item of orderItems) {
    if (!item.product) continue;
    const key = item.product.id;
    const existing = productMap.get(key);
    const lineRevenue = Number(item.price) * item.qty;
    if (existing) {
      existing.unitsSold += item.qty;
      existing.revenue += lineRevenue;
      existing.orderIds.add(item.orderId);
    } else {
      productMap.set(key, {
        productId: item.product.id,
        name: item.product.name,
        image: item.product.image,
        unitsSold: item.qty,
        revenue: lineRevenue,
        orderCount: 0,
        orderIds: new Set([item.orderId]),
      });
    }
  }
  const productRows = Array.from(productMap.values()).map((p) => ({
    productId: p.productId, name: p.name, image: p.image, unitsSold: p.unitsSold, revenue: p.revenue, orderCount: p.orderIds.size,
  }));

  const topProducts = [...productRows].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const worstProducts = [...productRows].sort((a, b) => a.revenue - b.revenue).slice(0, 10);

  // ── Category breakdown ───────────────────────────────────────────────────
  const categoryMap = new Map<number | null, CategoryBreakdownRow>();
  for (const item of orderItems) {
    const catId = item.product?.categoryId ?? null;
    const catName = item.product?.category?.name ?? "Uncategorized";
    const lineRevenue = Number(item.price) * item.qty;
    const existing = categoryMap.get(catId);
    if (existing) {
      existing.revenue += lineRevenue;
      existing.unitsSold += item.qty;
    } else {
      categoryMap.set(catId, { categoryId: catId, categoryName: catName, revenue: lineRevenue, unitsSold: item.qty });
    }
  }
  const categoryBreakdown = Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue);

  // ── Daily revenue trend ──────────────────────────────────────────────────
  const dailyMap = new Map<string, { revenue: number; orderCount: number }>();
  for (const o of orders) {
    const dateKey = o.createdAt.toISOString().slice(0, 10);
    const existing = dailyMap.get(dateKey);
    if (existing) {
      existing.revenue += Number(o.totalAmount);
      existing.orderCount += 1;
    } else {
      dailyMap.set(dateKey, { revenue: Number(o.totalAmount), orderCount: 1 });
    }
  }
  const dailyRevenue = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, revenue: v.revenue, orderCount: v.orderCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalRevenue = orders.reduce((s: number, o: (typeof orders)[number]) => s + Number(o.totalAmount), 0);
  const totalUnitsSold = orderItems.reduce((s: number, it: (typeof orderItems)[number]) => s + it.qty, 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // ── New vs returning customers (within this range) ──────────────────────
  let newCustomers = 0;
  let returningCustomers = 0;
  for (const c of customersInRange) {
    if (c.createdAt >= rangeStart && c.createdAt <= rangeEnd) newCustomers++;
    else returningCustomers++;
  }

  return {
    topProducts,
    worstProducts,
    categoryBreakdown,
    dailyRevenue,
    lowStockProducts: lowStock.map((p: (typeof lowStock)[number]) => ({ productId: p.id, name: p.name, stockQty: p.stockQty, price: Number(p.price) })),
    totalRevenue,
    totalUnitsSold,
    totalOrders,
    avgOrderValue,
    newVsReturningCustomers: { newCustomers, returningCustomers },
  };
}
