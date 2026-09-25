import { z } from "zod";

export const checkoutPaymentSchema = z.object({
  method: z.enum(["Cash", "Card", "UPI", "Other"]).catch("Other"),
  amount: z.coerce.number().min(0),
});

export const checkoutItemSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().min(1).default(1),
  // Staff on the internal billing screen may override price (negotiated deals,
  // damaged-item discount) — same trust boundary as the original PHP: this is
  // ONLY honored on the admin billing endpoint, never on the public storefront checkout.
  price_override: z.coerce.number().min(0).nullable().optional(),
  // Optional sold-by unit chosen at the counter (Billing2). When present it is
  // recorded on the order line as "Name (Unit)" so the invoice shows it.
  unit: z.string().trim().max(40).optional(),
});

export const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1, "Cart is empty."),
  customer_id: z.coerce.number().int().default(0),
  customer_name: z.string().trim().default(""),
  customer_phone: z.string().trim().default(""),
  is_guest: z.boolean().default(false),
  payments: z.array(checkoutPaymentSchema).default([]),
  promised_date: z.string().nullable().optional(),
  coupon_code: z.string().trim().default(""),
  // Offline billing: the till's own id for this bill (same id on every retry),
  // when it was really sold, and the discount the customer actually got.
  client_ref: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  offline: z.boolean().default(false),
  sold_at: z.string().max(40).optional(),
  offline_discount: z.coerce.number().min(0).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
