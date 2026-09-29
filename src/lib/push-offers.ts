import { prisma } from "@/lib/db";
import { offerLabel } from "@/types/campaign-home";
import type { OfferHit } from "@/lib/push-offers-shared";

export type { OfferHit } from "@/lib/push-offers-shared";

/** Campaigns running now (or starting later) and live coupons, for Push → "Offer". */
export async function listPushOffers(): Promise<OfferHit[]> {
  const now = new Date();
  const [camps, coupons] = await Promise.all([
    prisma.ecomCampaign.findMany({
      where: { isPaused: false, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: { id: "desc" }, take: 40, include: { targets: { take: 50 } },
    }),
    prisma.ecomCoupon.findMany({
      where: { status: "active", isPaused: false, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: { id: "desc" }, take: 60,
      include: { product: { select: { name: true, slug: true, image: true } }, category: { select: { name: true, slug: true, image: true } } },
    }),
  ]);

  type T = { targetType: string; targetId: number };
  const ids = (type: string) => [...new Set((camps as { targets: T[] }[]).flatMap((r) => r.targets.filter((t) => t.targetType === type).map((t) => t.targetId)))];
  const [cats, brands, products] = await Promise.all([
    prisma.ecomCategory.findMany({ where: { id: { in: ids("category") } }, select: { id: true, name: true, slug: true, image: true } }),
    prisma.ecomBrand.findMany({ where: { id: { in: ids("brand") } }, select: { id: true, name: true, logo: true } }),
    prisma.ecomProduct.findMany({ where: { id: { in: ids("product") } }, select: { id: true, name: true, slug: true, image: true } }),
  ]);

  const out: OfferHit[] = [];
  for (const r of camps as { id: number; name: string; scope: string; discountType: string; discountValue: unknown; startsAt: Date | null; endsAt: Date | null; targets: T[] }[]) {
    let appliesTo = "everything", href = "/?sort=discount", image: string | null = null;
    const pick = <X extends { id: number }>(list: X[]) => r.targets.map((x) => list.find((c) => c.id === x.targetId)).filter((c): c is X => !!c);
    if (r.scope === "category") {
      const l = pick(cats); appliesTo = l.length === 1 ? l[0].name : `${l.length} categories`;
      if (l.length === 1) { href = `/category?slug=${encodeURIComponent(l[0].slug)}`; image = l[0].image; }
    } else if (r.scope === "brand") {
      const l = pick(brands); appliesTo = l.length === 1 ? l[0].name : `${l.length} brands`;
      if (l.length === 1) { href = `/?q=${encodeURIComponent(l[0].name)}`; image = l[0].logo; }
    } else if (r.scope === "product") {
      const l = pick(products); appliesTo = l.length === 1 ? l[0].name : `${l.length} products`;
      if (l.length === 1) { href = `/product?slug=${encodeURIComponent(l[0].slug)}`; }
      image = l[0]?.image ?? null;
    }
    out.push({
      key: `c${r.id}`, type: "campaign", id: r.id, name: r.name, offer: offerLabel(r.discountType, r.discountValue === null ? null : Number(r.discountValue)),
      appliesTo, href, image, code: null, endsAt: r.endsAt?.toISOString() ?? null, upcoming: !!r.startsAt && r.startsAt > now,
    });
  }
  for (const c of coupons as { id: number; title: string; code: string; discountType: string; discountValue: unknown; appliesTo: string; usedCount: number; numberOfTimes: number; startsAt: Date | null; endsAt: Date | null; product: { name: string; slug: string; image: string | null } | null; category: { name: string; slug: string; image: string | null } | null }[]) {
    if (c.usedCount >= c.numberOfTimes) continue;
    const v = Number(c.discountValue);
    const href = c.appliesTo === "product" && c.product ? `/product?slug=${encodeURIComponent(c.product.slug)}`
      : c.appliesTo === "category" && c.category ? `/category?slug=${encodeURIComponent(c.category.slug)}` : "/";
    out.push({
      key: `k${c.id}`, type: "coupon", id: c.id, name: c.title || c.code, offer: c.discountType === "percentage" ? `${v}% OFF` : `₹${v} OFF`,
      appliesTo: c.appliesTo === "product" ? c.product?.name ?? "a product" : c.appliesTo === "category" ? c.category?.name ?? "a category" : "everything",
      href, image: c.product?.image ?? c.category?.image ?? null, code: c.code, endsAt: c.endsAt?.toISOString() ?? null, upcoming: !!c.startsAt && c.startsAt > now,
    });
  }
  return out;
}
