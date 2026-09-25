import { prisma } from "@/lib/db";
import type { AdminSession } from "@/lib/admin-auth";

const IST = 5.5 * 3600_000, DAY = 86_400_000;
const istYmd = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const has = (p: AdminSession["permissions"], g: string, k: string) => !!p?.[g]?.[k];
const saleWhere = { OR: [{ orderType: "offline" }, { orderType: "online", orderStatus: "Delivered" }] };

/** Numbers for the app's home screen — only the ones this role may see. */
export async function appDashboard(s: AdminSession) {
  const p = s.permissions;
  const today = istYmd(new Date());
  const start = istStart(today);
  const weekStart = istStart(istYmd(new Date(start.getTime() - 6 * DAY)));
  const seesSales = has(p, "ecommerce", "manage_billing") || has(p, "ecommerce", "manage_orders");
  const seesOrders = has(p, "orders", "view");
  const seesDues = has(p, "ecommerce", "manage_billing") || has(p, "ecommerce", "manage_credits") || has(p, "ecommerce", "manage_customers");
  const seesStock = has(p, "ecommerce", "manage_products");
  const agent = has(p, "delivery", "deliver");

  const out: Record<string, unknown> = { today };
  const jobs: Promise<void>[] = [];

  if (seesSales) jobs.push((async () => {
    const week = await prisma.ecomOrder.findMany({ where: { AND: [saleWhere, { createdAt: { gte: weekStart } }] }, select: { totalAmount: true, createdAt: true, orderType: true } });
    const days = Array.from({ length: 7 }, (_, i) => istYmd(new Date(weekStart.getTime() + i * DAY + IST / 2)));
    const series = days.map((d) => ({ day: d, sales: 0, orders: 0 }));
    let todaySales = 0, todayCount = 0, todayStore = 0, todayOnline = 0;
    for (const o of week) {
      const d = istYmd(o.createdAt), t = Number(o.totalAmount);
      const row = series.find((x) => x.day === d);
      if (row) { row.sales += t; row.orders++; }
      if (d === today) { todaySales += t; todayCount++; if (o.orderType === "offline") todayStore += t; else todayOnline += t; }
    }
    out.sales = { today: round(todaySales), count: todayCount, store: round(todayStore), online: round(todayOnline), week: series.map((x) => ({ ...x, sales: round(x.sales) })) };
  })());

  if (seesOrders) jobs.push((async () => {
    const [byStatus, placedToday, recent] = await Promise.all([
      prisma.ecomOrder.groupBy({ by: ["orderStatus"], where: { orderType: "online", orderStatus: { notIn: ["Delivered", "Canceled"] } }, _count: { _all: true } }),
      prisma.ecomOrder.count({ where: { orderType: "online", createdAt: { gte: start } } }),
      prisma.ecomOrder.findMany({ where: { orderType: "online" }, orderBy: { id: "desc" }, take: 8, select: { id: true, orderNumber: true, customerName: true, totalAmount: true, orderStatus: true, createdAt: true } }),
    ]);
    const c = (st: string) => byStatus.find((x) => x.orderStatus === st)?._count._all ?? 0;
    out.orders = { pending: c("Pending"), inProgress: c("In Progress"), outForDelivery: c("Out for Delivery"), placedToday,
      recent: recent.map((o) => ({ id: o.id, number: o.orderNumber, customer: o.customerName, total: Number(o.totalAmount), status: o.orderStatus, createdAt: o.createdAt.toISOString() })) };
  })());

  if (seesDues) jobs.push((async () => {
    const [open, collected] = await Promise.all([
      prisma.ecomCredit.aggregate({ where: { status: { not: "paid" } }, _sum: { amount: true, amountPaid: true }, _count: { _all: true } }),
      prisma.ecomCreditPayment.aggregate({ where: { createdAt: { gte: start } }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    out.dues = { outstanding: round(Number(open._sum.amount ?? 0) - Number(open._sum.amountPaid ?? 0)), open: open._count._all, collectedToday: round(Number(collected._sum.amount ?? 0)), collections: collected._count._all };
  })());

  if (seesStock) jobs.push((async () => {
    const [low, out0, total] = await Promise.all([
      prisma.ecomProduct.count({ where: { status: "active", productType: "physical", stockQty: { gt: 0, lte: 5 } } }),
      prisma.ecomProduct.count({ where: { status: "active", productType: "physical", stockQty: 0 } }),
      prisma.ecomProduct.count({ where: { status: "active" } }),
    ]);
    out.stock = { low, out: out0, products: total };
  })());

  if (agent) jobs.push((async () => {
    const mine = await prisma.ecomOrder.findMany({ where: { deliveryAgentId: s.userId, OR: [{ orderStatus: { notIn: ["Delivered", "Canceled"] } }, { deliveredAt: { gte: start } }] }, select: { orderStatus: true, paymentStatus: true, totalAmount: true, deliveredAt: true } });
    const active = mine.filter((o) => !["Delivered", "Canceled"].includes(o.orderStatus));
    out.agent = {
      active: active.length, onTheWay: active.filter((o) => o.orderStatus === "Out for Delivery").length,
      deliveredToday: mine.filter((o) => o.deliveredAt && o.deliveredAt >= start).length,
      toCollect: round(active.filter((o) => o.paymentStatus !== "Paid").reduce((sum, o) => sum + Number(o.totalAmount), 0)),
    };
  })());

  await Promise.all(jobs);
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
