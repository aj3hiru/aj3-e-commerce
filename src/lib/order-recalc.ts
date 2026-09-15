import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

/** Verified against recalcOrderTotals() in order-view.php: re-sums every line
 *  item's price*qty and GST, refreshes each item's stored gst_amount, and updates
 *  the parent order's subtotal/gst/total (grand_total = subtotal - discount + gst,
 *  clamped to a minimum of 0). Discount itself is untouched here — this recalculates
 *  around whatever discount is already on the order. */
export async function recalcOrderTotals(tx: Prisma.TransactionClient | typeof prisma, orderId: number): Promise<void> {
  const items = await tx.ecomOrderItem.findMany({ where: { orderId } });

  let subtotal = 0;
  let totalGst = 0;

  for (const it of items) {
    const lineTotal = Number(it.price) * it.qty;
    const gstRate = Number(it.gstRate) || 0;
    const lineGst = Math.round(lineTotal * (gstRate / 100) * 100) / 100;
    subtotal += lineTotal;
    totalGst += lineGst;
    await tx.ecomOrderItem.update({ where: { id: it.id }, data: { gstAmount: lineGst } });
  }

  const order = await tx.ecomOrder.findUnique({ where: { id: orderId }, select: { discountAmount: true } });
  const discount = Number(order?.discountAmount ?? 0);
  const grandTotal = Math.max(0, subtotal - discount + totalGst);

  await tx.ecomOrder.update({
    where: { id: orderId },
    data: { subtotalAmount: subtotal, gstAmount: totalGst, totalAmount: grandTotal },
  });
}

/** Verified against isLocked() in order-view.php — a Delivered order can no
 *  longer be edited (status changed, items added/removed/qty-changed). */
export function isOrderLocked(orderStatus: string): boolean {
  return orderStatus === "Delivered";
}
