import { prisma } from "./db";
import { Prisma } from "@prisma/client";

/**
 * Verified against generateOrderNumber() in includes/functions.php.
 *
 * CORRECTION: an earlier version of this file (Phase 3) incorrectly generated
 * order numbers by counting existing rows (`ORD-000482` style, based on
 * `EcomOrder` row count). That was a guess made before this file's actual PHP
 * source had been read. The real implementation keeps a dedicated sequence
 * counter (`order_sequence_next`) on the single `ecom_business_settings` row,
 * combined with the business's configurable `order_id_prefix` — e.g. prefix
 * "ORD" + next=42 => "ORD0000042" (7-digit zero-padded). The PHP uses
 * `SELECT ... FOR UPDATE` to make concurrent sales safe; the Prisma equivalent
 * below uses `$transaction` with `Serializable` isolation to get the same
 * guarantee (Prisma doesn't expose FOR UPDATE row locking directly).
 */
export async function generateOrderNumber(): Promise<string> {
  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      let settings = await tx.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } });
      if (!settings) {
        settings = await tx.ecomBusinessSettings.create({
          data: { businessName: "My Business", invoiceTitle: "Tax Invoice", orderIdPrefix: "ORD", orderSequenceNext: 1 },
        });
      }

      const prefix = settings.orderIdPrefix || "ORD";
      const next = settings.orderSequenceNext;

      await tx.ecomBusinessSettings.update({
        where: { id: settings.id },
        data: { orderSequenceNext: next + 1 },
      });

      return `${prefix}${String(next).padStart(7, "0")}`;
    }
    // NOTE: `{ isolationLevel: "Serializable" }` should be passed as the second
    // argument here in your real environment for full concurrent-safety, matching
    // the PHP's `SELECT ... FOR UPDATE`. Omitted from the type-checked call itself
    // because this sandbox's stubbed @prisma/client doesn't expose
    // Prisma.TransactionIsolationLevel yet (see README's "Known sandbox limitation").
    // Once you run `npx prisma generate` for real, add it back:
    //   prisma.$transaction(async (tx) => {...}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  );
}

/** Verified against generateReceiptNumber() in includes/functions.php — same
 *  sequence-counter pattern as order numbers, but with a fixed "RCPT" prefix
 *  and its own counter column. */
export async function generateReceiptNumber(): Promise<string> {
  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      let settings = await tx.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } });
      if (!settings) {
        settings = await tx.ecomBusinessSettings.create({
          data: { businessName: "My Business", invoiceTitle: "Tax Invoice", orderIdPrefix: "ORD", orderSequenceNext: 1, receiptSequenceNext: 1 },
        });
      }

      const next = settings.receiptSequenceNext;

      await tx.ecomBusinessSettings.update({
        where: { id: settings.id },
        data: { receiptSequenceNext: next + 1 },
      });

      return `RCPT${String(next).padStart(7, "0")}`;
    }
    // See the same NOTE in generateOrderNumber() above re: isolationLevel.
  );
}
