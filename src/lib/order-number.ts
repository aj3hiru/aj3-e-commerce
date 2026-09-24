import { prisma } from "./db";
import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/** Returns the single ecom_business_settings row id, creating the row if missing. */
async function settingsId(db: Db): Promise<number> {
  const settings = await db.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
  if (settings) return settings.id;
  const created = await db.ecomBusinessSettings.create({
    data: { businessName: "My Business", invoiceTitle: "Tax Invoice", orderIdPrefix: "ORD", orderSequenceNext: 1, receiptSequenceNext: 1 },
    select: { id: true },
  });
  return created.id;
}

/**
 * Verified against generateOrderNumber() in includes/functions.php: a
 * dedicated sequence counter (`order_sequence_next`) on the single
 * `ecom_business_settings` row, combined with the configurable
 * `order_id_prefix` — e.g. prefix "ORD" + next=42 => "ORD0000042".
 *
 * The counter is bumped with a single atomic `increment` UPDATE (which takes
 * the row lock, like the PHP's SELECT ... FOR UPDATE) and the reserved value
 * is read back from that same statement, so two concurrent sales can never
 * receive the same number. Pass the checkout's own transaction client so a
 * failed checkout rolls the counter back too instead of leaving a gap.
 */
export async function generateOrderNumber(db: Db = prisma): Promise<string> {
  const id = await settingsId(db);
  const updated = await db.ecomBusinessSettings.update({
    where: { id },
    data: { orderSequenceNext: { increment: 1 } },
    select: { orderIdPrefix: true, orderSequenceNext: true },
  });
  const prefix = updated.orderIdPrefix || "ORD";
  return `${prefix}${String(updated.orderSequenceNext - 1).padStart(7, "0")}`;
}

/** Verified against generateReceiptNumber() in includes/functions.php — same
 *  sequence-counter pattern as order numbers, but with a fixed "RCPT" prefix
 *  and its own counter column. */
export async function generateReceiptNumber(db: Db = prisma): Promise<string> {
  const id = await settingsId(db);
  const updated = await db.ecomBusinessSettings.update({
    where: { id },
    data: { receiptSequenceNext: { increment: 1 } },
    select: { receiptSequenceNext: true },
  });
  return `RCPT${String(updated.receiptSequenceNext - 1).padStart(7, "0")}`;
}
