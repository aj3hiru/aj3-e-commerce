import { prisma } from "@/lib/db";
import type { CleanCampaign, RefLookup } from "@/lib/campaign-validate";

/** Looks up the categories, brands and products a campaign names, for checkCampaignRefs(). */
export async function lookupRefs(c: CleanCampaign): Promise<RefLookup> {
  const ids = (type: "category" | "brand" | "product") => c.targets.filter((t) => t.targetType === type).map((t) => t.targetId);
  const [cats, brands, prods] = await Promise.all([
    ids("category").length ? prisma.ecomCategory.findMany({ where: { id: { in: ids("category") } }, select: { id: true } }) : [],
    ids("brand").length ? prisma.ecomBrand.findMany({ where: { id: { in: ids("brand") } }, select: { id: true } }) : [],
    ids("product").length ? prisma.ecomProduct.findMany({ where: { id: { in: ids("product") } }, select: { id: true, price: true } }) : [],
  ]);
  return {
    categoryIds: new Set((cats as { id: number }[]).map((x) => x.id)),
    brandIds: new Set((brands as { id: number }[]).map((x) => x.id)),
    productPrices: new Map((prods as { id: number; price: unknown }[]).map((x) => [x.id, Number(x.price)] as const)),
  };
}
