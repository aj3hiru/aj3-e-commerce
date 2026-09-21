import { prisma } from "@/lib/db";

/**
 * Data for /admin/ecommerce/product-tags2 — "Badge Tags & Item Types".
 *
 * A badge tag is the little label shown on a product card in the shop
 * ("New", "Best Seller"…). An item type groups products in a way that suits
 * the shop ("Normal", "Combo"…). Both live in the same table, told apart by
 * tagGroup.
 *
 * Each tag is shown with how many products carry it and how much it has sold,
 * so it's easy to see which badges are doing any work. Sales follow the same
 * rule as Sales History: in-store (POS) bills always count, online orders once
 * they are Delivered.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;

export const istYmd = (d: Date): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const istEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);
const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type TagGroup = "badge" | "item_type";

export interface Tag2Row {
  id: number;
  label: string;
  slug: string;
  tagGroup: TagGroup;
  color: string | null;
  sortOrder: number;
  status: string;
  /** How many products carry this tag right now. */
  products: number;
  activeProducts: number;
  /** Units sold and money taken, inside the chosen dates. */
  unitsSold: number;
  revenue: number;
  orders: number;
  /** Units sold over all time, so a new date range doesn't hide a tag's history. */
  unitsSoldAllTime: number;
}

export interface Tags2Cards {
  badges: number;
  itemTypes: number;
  active: number;
  inactive: number;
  unused: number;
  taggedProducts: number;
  untaggedProducts: number;
  revenue: number;
  unitsSold: number;
  topLabel: string | null;
  topUnits: number;
}

export interface Tags2Data {
  rows: Tag2Row[];
  cards: Tags2Cards;
  /** Badge/type values used by products but missing from the tag list. */
  orphans: { value: string; tagGroup: TagGroup; products: number }[];
  range: { from: string; to: string };
  today: string;
}

export function parseTagRange(sp: { from?: string; to?: string }): { from: string; to: string } {
  const today = istYmd(new Date());
  let from = isYmd(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
  let to = isYmd(sp.to) ? sp.to : today;
  if (to < from) [from, to] = [to, from];
  const days = Math.round((istStart(to).getTime() - istStart(from).getTime()) / DAY_MS);
  if (days > 366) from = istYmd(new Date(istStart(to).getTime() - 366 * DAY_MS));
  return { from, to };
}

export async function getTags2Data(range: { from: string; to: string }): Promise<Tags2Data> {
  const rangeStart = istStart(range.from);
  const rangeEnd = istEnd(range.to);
  const soldWhere = { OR: [{ orderType: "offline" }, { orderType: "online", orderStatus: "Delivered" }] };

  const [tagRows, productRows, itemRows] = await Promise.all([
    prisma.ecomProductTag.findMany({ orderBy: [{ tagGroup: "asc" }, { sortOrder: "asc" }, { id: "asc" }] }),
    prisma.ecomProduct.findMany({ select: { id: true, badgeTag: true, itemType: true, status: true } }),
    // Every sold line, with the product's current badge and type.
    prisma.ecomOrderItem.findMany({
      where: { order: soldWhere },
      select: {
        orderId: true, qty: true, price: true,
        order: { select: { createdAt: true } },
        product: { select: { badgeTag: true, itemType: true } },
      },
    }),
  ]);

  const products = productRows as { id: number; badgeTag: string; itemType: string; status: string }[];
  const items = itemRows as {
    orderId: number; qty: number; price: unknown;
    order: { createdAt: Date } | null;
    product: { badgeTag: string; itemType: string } | null;
  }[];

  // ── product counts per tag value ──
  const countBy = (pick: (p: (typeof products)[number]) => string) => {
    const m = new Map<string, { all: number; active: number }>();
    for (const p of products) {
      const key = (pick(p) ?? "").trim().toLowerCase();
      if (!key) continue;
      const cur = m.get(key) ?? { all: 0, active: 0 };
      cur.all++;
      if (p.status === "active") cur.active++;
      m.set(key, cur);
    }
    return m;
  };
  const badgeCounts = countBy((p) => p.badgeTag);
  const typeCounts = countBy((p) => p.itemType);

  // ── sales per tag value ──
  type Sale = { units: number; revenue: number; orders: Set<number>; unitsAllTime: number };
  const blank = (): Sale => ({ units: 0, revenue: 0, orders: new Set(), unitsAllTime: 0 });
  const badgeSales = new Map<string, Sale>();
  const typeSales = new Map<string, Sale>();

  for (const it of items) {
    if (!it.product || !it.order) continue;
    const when = it.order.createdAt.getTime();
    const inRange = when >= rangeStart.getTime() && when <= rangeEnd.getTime();
    const line = Number(it.price) * it.qty;

    for (const [map, raw] of [[badgeSales, it.product.badgeTag], [typeSales, it.product.itemType]] as [Map<string, Sale>, string][]) {
      const key = (raw ?? "").trim().toLowerCase();
      if (!key) continue;
      const cur = map.get(key) ?? blank();
      cur.unitsAllTime += it.qty;
      if (inRange) {
        cur.units += it.qty;
        cur.revenue += line;
        cur.orders.add(it.orderId);
      }
      map.set(key, cur);
    }
  }

  const rows: Tag2Row[] = (tagRows as {
    id: number; label: string; slug: string; tagGroup: string; color: string | null; sortOrder: number; status: string;
  }[]).map((t) => {
    const group: TagGroup = t.tagGroup === "item_type" ? "item_type" : "badge";
    const key = t.slug.trim().toLowerCase();
    const counts = (group === "badge" ? badgeCounts : typeCounts).get(key) ?? { all: 0, active: 0 };
    const sale = (group === "badge" ? badgeSales : typeSales).get(key) ?? blank();
    return {
      id: t.id,
      label: t.label,
      slug: t.slug,
      tagGroup: group,
      color: t.color,
      sortOrder: t.sortOrder,
      status: t.status,
      products: counts.all,
      activeProducts: counts.active,
      unitsSold: sale.units,
      revenue: r2(sale.revenue),
      orders: sale.orders.size,
      unitsSoldAllTime: sale.unitsAllTime,
    };
  });

  // Values products actually use that have no tag row — worth showing so they
  // can be created rather than silently ignored.
  const known = new Set(rows.map((r) => `${r.tagGroup}:${r.slug.trim().toLowerCase()}`));
  const orphans: { value: string; tagGroup: TagGroup; products: number }[] = [];
  for (const [group, map] of [["badge", badgeCounts], ["item_type", typeCounts]] as [TagGroup, typeof badgeCounts][]) {
    for (const [value, c] of map) {
      if (value === "none" || value === "normal") continue; // the built-in defaults
      if (!known.has(`${group}:${value}`)) orphans.push({ value, tagGroup: group, products: c.all });
    }
  }
  orphans.sort((a, b) => b.products - a.products);

  const badges = rows.filter((r) => r.tagGroup === "badge");
  const types = rows.filter((r) => r.tagGroup === "item_type");
  const tagged = products.filter((p) => (p.badgeTag ?? "none") !== "none").length;
  const top = [...rows].sort((a, b) => b.unitsSold - a.unitsSold)[0];

  return {
    rows,
    cards: {
      badges: badges.length,
      itemTypes: types.length,
      active: rows.filter((r) => r.status === "active").length,
      inactive: rows.filter((r) => r.status !== "active").length,
      unused: rows.filter((r) => r.products === 0).length,
      taggedProducts: tagged,
      untaggedProducts: products.length - tagged,
      revenue: r2(rows.filter((r) => r.tagGroup === "badge").reduce((s, r) => s + r.revenue, 0)),
      unitsSold: badges.reduce((s, r) => s + r.unitsSold, 0),
      topLabel: top && top.unitsSold > 0 ? top.label : null,
      topUnits: top?.unitsSold ?? 0,
    },
    orphans,
    range,
    today: istYmd(new Date()),
  };
}
