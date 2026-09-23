/**
 * Rules for saving a review from /admin/ecommerce/product-reviews. Pure (no
 * database), so the form and the API apply exactly the same checks.
 */
export interface CleanReview {
  productId: number;
  customerName: string;
  customerId: number | null;
  customerPhone: string | null;
  orderId: number | null;
  rating: number;
  reviewText: string | null;
  status: "pending" | "approved" | "rejected";
  /** Only set when adding a review by hand and back-dating it. */
  createdAt: Date | null;
}

export type ReviewParse = { ok: true; value: CleanReview } | { ok: false; message: string; field?: string };

const STATUSES = ["pending", "approved", "rejected"] as const;

export function parseReviewInput(raw: unknown, opts: { requireProduct: boolean }): ReviewParse {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Invalid request." };
  const b = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const intOrNull = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

  const productId = intOrNull(b.productId);
  if (opts.requireProduct && productId === null) return { ok: false, message: "Choose the product this review is for.", field: "productId" };

  const customerName = str(b.customerName);
  if (!customerName) return { ok: false, message: "Enter the reviewer's name.", field: "customerName" };
  if (customerName.length > 150) return { ok: false, message: "The name can be at most 150 characters.", field: "customerName" };

  const rating = typeof b.rating === "number" ? b.rating : NaN;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, message: "Give a rating from 1 to 5 stars.", field: "rating" };

  const reviewText = str(b.reviewText);
  if (reviewText.length > 5000) return { ok: false, message: "The review is too long (5000 characters max).", field: "reviewText" };

  const phone = str(b.customerPhone);
  if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) return { ok: false, message: "That phone number doesn't look right.", field: "customerPhone" };

  const status = STATUSES.includes(b.status as (typeof STATUSES)[number]) ? (b.status as (typeof STATUSES)[number]) : "pending";

  let createdAt: Date | null = null;
  if (typeof b.createdAt === "string" && b.createdAt !== "") {
    const d = new Date(b.createdAt);
    if (Number.isNaN(d.getTime())) return { ok: false, message: "That date isn't valid.", field: "createdAt" };
    if (d.getTime() > Date.now() + 60_000) return { ok: false, message: "The date can't be in the future.", field: "createdAt" };
    createdAt = d;
  }

  return {
    ok: true,
    value: {
      productId: productId ?? 0,
      customerName,
      customerId: intOrNull(b.customerId),
      customerPhone: phone || null,
      orderId: intOrNull(b.orderId),
      rating,
      reviewText: reviewText || null,
      status,
      createdAt,
    },
  };
}
