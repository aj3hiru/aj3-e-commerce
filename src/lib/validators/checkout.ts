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
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
