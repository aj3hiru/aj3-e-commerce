import { prisma } from "@/lib/db";
import { istTodayStart } from "@/lib/deliveries";
import { LOW_STOCK_LIMIT } from "@/components/admin/products2/filters";

/** Numbers and short lists for each role's dashboard (the admin keeps the full store dashboard). */

export async function orderDeskData() {
  const today = istTodayStart();
  const online = { orderType: "online" } as const;
  const [pending, waiting, outFor, deliveredToday, canceledToday, codPending, newOrders, readyOrders, recent] = await Promise.all([
    prisma.ecomOrder.count({ where: { ...online, orderStatus: "Pending" } }),
    prisma.ecomOrder.count({ where: { ...online, orderStatus: "In Progress", deliveryAgentId: null } }),
    prisma.ecomOrder.count({ where: { ...online, orderStatus: "Out for Delivery" } }),
    prisma.ecomOrder.count({ where: { ...online, orderStatus: "Delivered", deliveredAt: { gte: today } } }),
    prisma.ecomOrderEvent.count({ where: { type: "status", toValue: "Canceled", createdAt: { gte: today } } }),
    prisma.ecomOrder.aggregate({ where: { ...online, paymentStatus: "Unpaid", orderStatus: { in: ["In Progress", "Out for Delivery"] } }, _sum: { totalAmount: true } }),
    prisma.ecomOrder.findMany({ where: { ...online, orderStatus: "Pending" }, orderBy: { createdAt: "asc" }, take: 10, select: { id: true, orderNumber: true, customerName: true, totalAmount: true, createdAt: true, paymentStatus: true, items: { select: { qty: true } } } }),
    prisma.ecomOrder.findMany({ where: { ...online, orderStatus: "In Progress", deliveryAgentId: null }, orderBy: { createdAt: "asc" }, take: 6, select: { id: true, orderNumber: true, customerName: true, totalAmount: true, createdAt: true } }),
    prisma.ecomOrderEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, type: true, fromValue: true, toValue: true, note: true, actorName: true, createdAt: true, order: { select: { id: true, orderNumber: true } } } }),
  ]);
  return {
    stats: { pending, waiting, outFor, deliveredToday, canceledToday, codPending: Number(codPending._sum.totalAmount ?? 0) },
    newOrders: newOrders.map((o) => ({ id: o.id, number: o.orderNumber, customer: o.customerName, total: Number(o.totalAmount), at: o.createdAt.toISOString(), items: o.items.reduce((n, i) => n + i.qty, 0), paid: o.paymentStatus === "Paid" })),
    readyOrders: readyOrders.map((o) => ({ id: o.id, number: o.orderNumber, customer: o.customerName, total: Number(o.totalAmount), at: o.createdAt.toISOString() })),
    recent: recent.map((e) => ({ id: e.id, type: e.type, from: e.fromValue, to: e.toValue, note: e.note, actor: e.actorName, at: e.createdAt.toISOString(), orderId: e.order.id, number: e.order.orderNumber })),
  };
}

export async function billingData() {
  const today = istTodayStart();
  const [salesToday, salesCount, dueAgg, collectedToday, recent] = await Promise.all([
    prisma.ecomOrder.aggregate({ where: { orderType: "offline", createdAt: { gte: today }, orderStatus: { not: "Canceled" } }, _sum: { totalAmount: true } }),
    prisma.ecomOrder.count({ where: { orderType: "offline", createdAt: { gte: today }, orderStatus: { not: "Canceled" } } }),
    prisma.ecomCredit.findMany({ where: { status: { not: "paid" } }, select: { amount: true, amountPaid: true } }),
    prisma.ecomCreditPayment.aggregate({ where: { createdAt: { gte: today } }, _sum: { amount: true } }),
    prisma.ecomOrder.findMany({ where: { orderType: "offline" }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, orderNumber: true, customerName: true, totalAmount: true, paymentStatus: true, createdAt: true } }),
  ]);
  return {
    stats: {
      salesToday: Number(salesToday._sum.totalAmount ?? 0), salesCount,
      dueOutstanding: dueAgg.reduce((n, c) => n + Math.max(0, Number(c.amount) - Number(c.amountPaid)), 0), dueCount: dueAgg.length,
      collectedToday: Number(collectedToday._sum.amount ?? 0),
    },
    recent: recent.map((o) => ({ id: o.id, number: o.orderNumber, customer: o.customerName || "Walk-in", total: Number(o.totalAmount), paid: o.paymentStatus === "Paid", at: o.createdAt.toISOString() })),
  };
}

export async function catalogData() {
  const physical = { status: "active", productType: "physical", stockQty: { not: null } } as const;
  const [total, active, out, low, noImage, pendingReviews, outList, recent] = await Promise.all([
    prisma.ecomProduct.count(),
    prisma.ecomProduct.count({ where: { status: "active" } }),
    prisma.ecomProduct.count({ where: { ...physical, stockQty: { lte: 0 } } }),
    prisma.ecomProduct.count({ where: { ...physical, stockQty: { gt: 0, lte: LOW_STOCK_LIMIT } } }),
    prisma.ecomProduct.count({ where: { status: "active", OR: [{ image: null }, { image: "" }] } }),
    prisma.ecomProductReview.count({ where: { status: "pending" } }),
    prisma.ecomProduct.findMany({ where: { ...physical, stockQty: { lte: LOW_STOCK_LIMIT } }, orderBy: { stockQty: "asc" }, take: 8, select: { id: true, name: true, stockQty: true, image: true } }),
    prisma.ecomProduct.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, name: true, status: true, image: true, createdAt: true } }),
  ]);
  return { stats: { total, active, out, low, noImage, pendingReviews }, lowStock: outList, recent: recent.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })) };
}

export async function marketingData() {
  const now = new Date();
  const week = new Date(Date.now() - 7 * 86_400_000);
  const [campaigns, coupons, subscribers, newCustomers, couponRows] = await Promise.all([
    prisma.ecomCampaign.count({ where: { isPaused: false, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } }),
    prisma.ecomCoupon.count({ where: { status: "active", isPaused: false } }),
    prisma.pushSubscription.count(),
    prisma.ecomCustomer.count({ where: { customerType: "online", createdAt: { gte: week } } }),
    prisma.ecomCoupon.findMany({ where: { status: "active" }, orderBy: { usedCount: "desc" }, take: 6, select: { id: true, code: true, title: true, usedCount: true, numberOfTimes: true, isPaused: true, endsAt: true } }),
  ]);
  return { stats: { campaigns, coupons, subscribers, newCustomers }, coupons: couponRows.map((c) => ({ ...c, endsAt: c.endsAt?.toISOString() ?? null })) };
}
