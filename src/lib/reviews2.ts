import { prisma } from "@/lib/db";

/**
 * Data for /admin/ecommerce/product-reviews.
 *
 * Reviews with everything the page needs to search and filter them: the
 * product, its category, the customer (and phone) where one is linked, and
 * the order it came from.
 *
 * Older reviews were saved before reviews could be linked to a customer, so
 * they have no customer id, phone or order. For those, the phone is filled in
 * only when the reviewer's name matches exactly ONE customer — that keeps
 * searching by phone useful without ever guessing between two people with the
 * same name. Such a phone is marked `phoneFromName`, and the page shows it as
 * "matched by name".
 *
 * Days are India time (IST), so "today" means today in the shop.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;

export const istYmd = (d: Date): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const istEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);
const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export interface Review2Row {
  id: number;
  productId: number;
  productName: string;
  productImage: string | null;
  categoryId: number | null;
  categoryName: string | null;
  brandName: string | null;
  customerId: number | null;
  customerName: string;
  customerPhone: string | null;
  phoneFromName: boolean;
  orderId: number | null;
  orderNumber: string | null;
  rating: number;
  reviewText: string | null;
  status: string; // "pending" | "approved" | "rejected"
  createdAt: string;
}

export interface Review2Cards {
  total: number;
  today: number;
  yesterday: number;
  pending: number;
  approved: number;
  rejected: number;
  inRange: number;
  averageRating: number;
  lowRatings: number;
  withText: number;
}

export interface Reviews2Data {
  rows: Review2Row[];
  cards: Review2Cards;
  /** Star counts 1–5 across every review, for the little bar chart. */
  ratingSpread: { rating: number; count: number }[];
  categories: { id: number; name: string }[];
  /** Products for the filter and for adding a review by hand. */
  products: { id: number; name: string; image: string | null; categoryId: number | null; price: number }[];
  customers: { id: number; name: string; phone: string | null }[];
  range: { from: string; to: string };
  today: string;
}

export function parseReviewRange(sp: { from?: string; to?: string }): { from: string; to: string } {
  const today = istYmd(new Date());
  let from = isYmd(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  let to = isYmd(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  const days = Math.round((istStart(to).getTime() - istStart(from).getTime()) / DAY_MS);
  if (days > 366) from = istYmd(new Date(istStart(to).getTime() - 366 * DAY_MS));
  return { from, to };
}

export async function getReviews2Data(range: { from: string; to: string }): Promise<Reviews2Data> {
  const [reviews, productRows, categoryRows, customerRows] = await Promise.all([
    prisma.ecomProductReview.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, productId: true, customerName: true, customerId: true, customerPhone: true, orderId: true,
        rating: true, reviewText: true, status: true, createdAt: true,
        product: { select: { name: true, image: true, categoryId: true, price: true, category: { select: { name: true } }, brand: { select: { name: true } } } },
      },
    }),
    prisma.ecomProduct.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, image: true, categoryId: true, price: true } }),
    prisma.ecomCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ecomCustomer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
  ]);

  const customers = customerRows as { id: number; name: string; phone: string | null }[];
  const byId = new Map(customers.map((c) => [c.id, c]));

  // Names that belong to exactly one customer — used only to fill in a phone
  // for older reviews that have no customer linked.
  const nameCounts = new Map<string, number>();
  for (const c of customers) nameCounts.set(c.name.trim().toLowerCase(), (nameCounts.get(c.name.trim().toLowerCase()) ?? 0) + 1);
  const uniqueByName = new Map<string, { id: number; name: string; phone: string | null }>();
  for (const c of customers) {
    const k = c.name.trim().toLowerCase();
    if (nameCounts.get(k) === 1) uniqueByName.set(k, c);
  }

  // Order numbers for the reviews that name an order.
  const orderIds = [...new Set((reviews as { orderId: number | null }[]).map((r) => r.orderId).filter((x): x is number => typeof x === "number"))];
  const orderNumbers = new Map<number, string>();
  if (orderIds.length) {
    const orders = (await prisma.ecomOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true } })) as { id: number; orderNumber: string }[];
    for (const o of orders) orderNumbers.set(o.id, o.orderNumber);
  }

  const rows: Review2Row[] = (reviews as {
    id: number; productId: number; customerName: string; customerId: number | null; customerPhone: string | null; orderId: number | null;
    rating: number; reviewText: string | null; status: string; createdAt: Date;
    product: { name: string; image: string | null; categoryId: number | null; price: unknown; category: { name: string } | null; brand: { name: string } | null } | null;
  }[]).map((r) => {
    let phone = r.customerPhone;
    let phoneFromName = false;
    let customerId = r.customerId;
    if (!phone && customerId !== null) phone = byId.get(customerId)?.phone ?? null;
    if (!phone && customerId === null) {
      const match = uniqueByName.get(r.customerName.trim().toLowerCase());
      if (match?.phone) {
        phone = match.phone;
        customerId = match.id;
        phoneFromName = true;
      }
    }
    return {
      id: r.id,
      productId: r.productId,
      productName: r.product?.name ?? "Unknown product",
      productImage: r.product?.image ?? null,
      categoryId: r.product?.categoryId ?? null,
      categoryName: r.product?.category?.name ?? null,
      brandName: r.product?.brand?.name ?? null,
      customerId,
      customerName: r.customerName,
      customerPhone: phone,
      phoneFromName,
      orderId: r.orderId,
      orderNumber: r.orderId !== null ? orderNumbers.get(r.orderId) ?? null : null,
      rating: r.rating,
      reviewText: r.reviewText,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const todayYmd = istYmd(new Date());
  const yesterdayYmd = istYmd(new Date(Date.now() - DAY_MS));
  const dayOf = (iso: string) => istYmd(new Date(iso));
  const rangeStart = istStart(range.from).getTime();
  const rangeEnd = istEnd(range.to).getTime();

  const ratingSpread = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: rows.filter((r) => r.rating === rating).length }));
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;

  return {
    rows,
    cards: {
      total: rows.length,
      today: rows.filter((r) => dayOf(r.createdAt) === todayYmd).length,
      yesterday: rows.filter((r) => dayOf(r.createdAt) === yesterdayYmd).length,
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      inRange: rows.filter((r) => { const t = new Date(r.createdAt).getTime(); return t >= rangeStart && t <= rangeEnd; }).length,
      averageRating: Math.round(avg * 10) / 10,
      lowRatings: rows.filter((r) => r.rating <= 2).length,
      withText: rows.filter((r) => (r.reviewText ?? "").trim() !== "").length,
    },
    ratingSpread,
    categories: categoryRows as { id: number; name: string }[],
    products: (productRows as { id: number; name: string; image: string | null; categoryId: number | null; price: unknown }[])
      .map((p) => ({ id: p.id, name: p.name, image: p.image, categoryId: p.categoryId, price: Number(p.price) })),
    customers,
    range,
    today: todayYmd,
  };
}
