/**
 * The canonical order/payment status vocabulary, in one place so the orders
 * list, the dashboard's Recent Orders table, the order detail view and the two
 * PATCH endpoints can never drift apart.
 *
 * This is a plain module (no "use client") on purpose: route handlers and
 * server components import it too, and pulling a client component into their
 * graph just to read a constant would be wrong.
 *
 * DEVIATION FROM THE PHP, deliberate and requested: orders.php defines
 *   $valid_order_statuses = ['Pending', 'In Progress', 'Delivered', 'Canceled'];
 * "Out for Delivery" is added here at the store owner's request, positioned
 * between "In Progress" and "Delivered" so the list reads in fulfilment order.
 * Existing rows are unaffected — it is a new value, not a rename.
 */
export const ORDER_STATUSES = [
  "Pending",
  "In Progress",
  "Out for Delivery",
  "Delivered",
  "Canceled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** $valid_payment_statuses in orders.php. The dropdowns list Paid first, which
 *  is the order the PHP's two <li> items were written in. */
export const PAYMENT_STATUSES = ["Paid", "Unpaid"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}
