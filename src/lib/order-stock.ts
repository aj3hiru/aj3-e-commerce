import type { Prisma } from "@prisma/client";

/** Only physical products with a tracked stock count move stock — the same rule
 *  the checkouts use when they deduct. */
async function isTracked(tx: Prisma.TransactionClient, productId: number): Promise<boolean> {
  const p = await tx.ecomProduct.findUnique({ where: { id: productId }, select: { productType: true, stockQty: true } });
  return !!p && p.productType === "physical" && p.stockQty !== null;
}

/** Moves stock for one product by `delta` (positive = back on the shelf,
 *  negative = taken off it). Never drops below zero, matching the checkout's
 *  GREATEST(stock_qty - qty, 0) behaviour. */
export async function adjustProductStock(tx: Prisma.TransactionClient, productId: number, delta: number): Promise<void> {
  if (delta === 0 || !(await isTracked(tx, productId))) return;
  if (delta > 0) {
    await tx.ecomProduct.update({ where: { id: productId }, data: { stockQty: { increment: delta } } });
    return;
  }
  const taken = await tx.ecomProduct.updateMany({
    where: { id: productId, stockQty: { gte: -delta } },
    data: { stockQty: { decrement: -delta } },
  });
  if (taken.count === 0) {
    await tx.ecomProduct.update({ where: { id: productId }, data: { stockQty: 0 } });
  }
}

/** The same for one size (only when that size keeps its own count), never below zero. */
async function adjustSizeStock(tx: Prisma.TransactionClient, sizeId: number, delta: number): Promise<void> {
  if (delta > 0) {
    await tx.ecomProductSize.updateMany({ where: { id: sizeId, stockQty: { not: null } }, data: { stockQty: { increment: delta } } });
    return;
  }
  const taken = await tx.ecomProductSize.updateMany({ where: { id: sizeId, stockQty: { gte: -delta } }, data: { stockQty: { decrement: -delta } } });
  if (taken.count === 0) await tx.ecomProductSize.updateMany({ where: { id: sizeId, stockQty: { not: null } }, data: { stockQty: 0 } });
}

/** Puts every line of an order back into stock (sign = 1), or takes it out
 *  again (sign = -1) — used when an order is canceled, un-canceled or deleted. */
export async function adjustOrderStock(tx: Prisma.TransactionClient, orderId: number, sign: 1 | -1): Promise<void> {
  const items = await tx.ecomOrderItem.findMany({ where: { orderId }, select: { productId: true, qty: true, sizeId: true } });
  for (const it of items) {
    await adjustProductStock(tx, it.productId, sign * it.qty);
    if (it.sizeId) await adjustSizeStock(tx, it.sizeId, sign * it.qty);
  }
}
