import { prisma } from "@/lib/db";
import { offerLabel, sanitizeCampaignHome, type CampaignBannerData } from "@/types/campaign-home";

/** Running campaigns switched to "Show on homepage", newest first (max 6). */
export async function getHomeCampaigns(): Promise<CampaignBannerData[]> {
  const now = new Date();
  let rows;
  try {
    rows = await prisma.ecomCampaign.findMany({
      where: {
        isPaused: false,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: { id: "desc" },
      include: { targets: { take: 50 } },
    });
  } catch {
    return []; // column not migrated yet
  }
  const shown = rows.filter((r) => sanitizeCampaignHome(r.homeDisplay).show).slice(0, 6);
  if (!shown.length) return [];

  const ids = (type: string) => [...new Set(shown.flatMap((r) => r.targets.filter((t) => t.targetType === type).map((t) => t.targetId)))];
  const [cats, brands, products] = await Promise.all([
    prisma.ecomCategory.findMany({ where: { id: { in: ids("category") } }, select: { id: true, name: true, slug: true } }),
    prisma.ecomBrand.findMany({ where: { id: { in: ids("brand") } }, select: { id: true, name: true } }),
    prisma.ecomProduct.findMany({ where: { id: { in: ids("product") } }, select: { id: true, name: true, slug: true } }),
  ]);

  return shown.map((r) => {
    const t = r.targets;
    let appliesTo = "on everything";
    let href = "/?sort=discount";
    if (r.scope === "category") {
      const list = t.map((x) => cats.find((c) => c.id === x.targetId)).filter((c): c is NonNullable<typeof c> => !!c);
      appliesTo = list.length === 1 ? `on ${list[0].name}` : `on ${list.length} categories`;
      if (list.length === 1) href = `/category?slug=${encodeURIComponent(list[0].slug)}`;
    } else if (r.scope === "brand") {
      const list = t.map((x) => brands.find((b) => b.id === x.targetId)).filter((b): b is NonNullable<typeof b> => !!b);
      appliesTo = list.length === 1 ? `on ${list[0].name}` : `on ${list.length} brands`;
      if (list.length === 1) href = `/?q=${encodeURIComponent(list[0].name)}`;
    } else if (r.scope === "product") {
      const list = t.map((x) => products.find((p) => p.id === x.targetId)).filter((p): p is NonNullable<typeof p> => !!p);
      appliesTo = list.length === 1 ? `on ${list[0].name}` : `on ${list.length} products`;
      if (list.length === 1) href = `/product?slug=${encodeURIComponent(list[0].slug)}`;
    }
    return {
      id: r.id,
      home: sanitizeCampaignHome(r.homeDisplay),
      name: r.name,
      offer: offerLabel(r.discountType, r.discountValue === null ? null : Number(r.discountValue)),
      appliesTo,
      endsAt: r.endsAt ? r.endsAt.toISOString() : null,
      href,
    };
  });
}
