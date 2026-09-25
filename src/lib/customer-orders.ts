import { prisma } from "@/lib/db";

export interface OrderSummary {
  id: number; number: string; date: string; status: string; total: number; itemCount: number;
  items: { name: string; image: string | null }[];
}

/** A customer's orders, newest first, with product thumbnails for the order cards. */
export async function loadCustomerOrders(customerId: number, take?: number): Promise<OrderSummary[]> {
  const orders = await prisma.ecomOrder.findMany({
    where: { customerId }, orderBy: { createdAt: "desc" }, take,
    include: { items: { select: { productName: true, productId: true, qty: true } } },
  });
  const ids = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId)))];
  const imgs = new Map((ids.length ? await prisma.ecomProduct.findMany({ where: { id: { in: ids } }, select: { id: true, image: true } }) : []).map((p) => [p.id, p.image]));
  return orders.map((o) => ({
    id: o.id, number: o.orderNumber, date: o.createdAt.toISOString(), status: o.orderStatus, total: Number(o.totalAmount),
    itemCount: o.items.reduce((n, i) => n + i.qty, 0),
    items: o.items.map((i) => ({ name: i.productName, image: imgs.get(i.productId) ?? null })),
  }));
}
