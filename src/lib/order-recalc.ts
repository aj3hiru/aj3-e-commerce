import { prisma } from "./db";
import type { Prisma } from "@prisma/client";
import { adjustOrderStock } from "./order-stock";
import { getTaxMode, itemsTotal, lineTax } from "./tax-mode";

/** Verified against recalcOrderTotals() in order-view.php: re-sums every line
 *  item's price*qty and GST, refreshes each item's stored gst_amount, and updates
 *  the parent order's subtotal/gst/total (grand_total = subtotal - discount + gst,
 *  clamped to a minimum of 0). Discount itself is untouched here — this recalculates
 *  around whatever discount is already on the order. */
export async function recalcOrderTotals(tx: Prisma.TransactionClient | typeof prisma, orderId: number): Promise<void> {
  const items = await tx.ecomOrderItem.findMany({ where: { orderId } });
  const order = await tx.ecomOrder.findUnique({ where: { id: orderId }, select: { discountAmount: true, deliveryCharge: true } });
  const discount = Number(order?.discountAmount ?? 0);
  // The delivery charge the customer was quoted at checkout stays as it was.
  const delivery = Number(order?.deliveryCharge ?? 0);

  const subtotal = items.reduce((s, it) => s + Number(it.price) * it.qty, 0);
  // Keep the order's own mode: GST inside the prices when its total didn't add the GST.
  const cur = await tx.ecomOrder.findUnique({ where: { id: orderId }, select: { totalAmount: true, subtotalAmount: true, gstAmount: true } });
  const inclusiveNow = cur && Number(cur.gstAmount) > 0
    ? Math.abs(Number(cur.totalAmount) - (Number(cur.subtotalAmount) - discount + delivery)) < 0.05
    : null;
  const taxMode = inclusiveNow === null ? await getTaxMode() : { pricesIncludeTax: inclusiveNow };
  let totalGst = 0;

  for (const it of items) {
    const lineTotal = Number(it.price) * it.qty;
    const gstRate = Number(it.gstRate) || 0;
    // GST on the discounted value, the discount spread across lines in
    // proportion to their totals — exactly how both checkouts computed it when
    // the order was placed. (Taxing the pre-discount amount here made every
    // edit silently raise the GST on discounted orders.)
    const discountShare = subtotal > 0 ? discount * (lineTotal / subtotal) : 0;
    const taxable = Math.max(0, lineTotal - discountShare);
    const lineGst = Math.round(lineTax(taxable, gstRate, taxMode.pricesIncludeTax) * 100) / 100;
    totalGst += lineGst;
    await tx.ecomOrderItem.update({ where: { id: it.id }, data: { gstAmount: lineGst } });
  }

  const grandTotal = itemsTotal(Math.max(0, subtotal - discount), totalGst, taxMode.pricesIncludeTax) + delivery;

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

/** A payment-status toggle can't settle (or un-settle) an order that has an
 *  open due record — the money has to be recorded on the Due page, which
 *  issues a receipt and keeps the due balance and the order in step. */
export async function paymentChangeBlocked(tx: Prisma.TransactionClient | typeof prisma, orderId: number): Promise<string | null> {
  const openDue = await tx.ecomCredit.count({ where: { orderId, status: { not: "paid" } } });
  return openDue > 0 ? "This order has an open due. Record the payment from the Due page instead." : null;
}

/** Canceling an order puts its stock back on the shelf; moving it out of
 *  Canceled again takes the stock back off. */
export async function syncCancelStock(tx: Prisma.TransactionClient, orderId: number, from: string, to: string): Promise<void> {
  const sign = from !== "Canceled" && to === "Canceled" ? 1 : from === "Canceled" && to !== "Canceled" ? -1 : 0;
  if (!sign) return;
  await adjustOrderStock(tx, orderId, sign);
  // The coupon's use comes back with a cancelled order (and is taken again if it is un-cancelled).
  const o = await tx.ecomOrder.findUnique({ where: { id: orderId }, select: { couponCode: true } });
  if (o?.couponCode) {
    await tx.ecomCoupon.updateMany({
      where: { code: o.couponCode, ...(sign === 1 ? { usedCount: { gt: 0 } } : {}) },
      data: { usedCount: sign === 1 ? { decrement: 1 } : { increment: 1 } },
    });
  }
}
