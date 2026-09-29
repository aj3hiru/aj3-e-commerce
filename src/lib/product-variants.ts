import { prisma } from "@/lib/db";
import { packSortKey, type VariantProduct } from "@/lib/product-variants-shared";

export * from "@/lib/product-variants-shared";

const SELECT = {
  id: true, name: true, slug: true, image: true, quantity: true, unit: true, price: true, salePrice: true,
  stockQty: true, barcode: true, status: true, variantGroup: true, brand: { select: { name: true } },
} as const;

type Row = {
  id: number; name: string; slug: string; image: string | null; quantity: unknown; unit: string | null; price: unknown;
  salePrice: unknown; stockQty: number | null; barcode: string | null; status: string; variantGroup: number | null; brand: { name: string } | null;
};

export function toVariant(r: Row): VariantProduct & { variantGroup: number | null } {
  return {
    id: r.id, name: r.name, slug: r.slug, image: r.image,
    quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
    unit: r.unit, price: Number(r.price), salePrice: r.salePrice === null || r.salePrice === undefined ? null : Number(r.salePrice),
    stockQty: r.stockQty, barcode: r.barcode, status: r.status, brand: r.brand?.name ?? null, variantGroup: r.variantGroup,
  };
}

const sortVariants = <T extends VariantProduct>(list: T[]) =>
  list.sort((a, b) => packSortKey(a.quantity, a.unit) - packSortKey(b.quantity, b.unit) || a.price - b.price || a.id - b.id);

/** Every product in the same variant group as `productId` (including itself), small → large. */
export async function variantsOf(productId: number, onlyActive = false) {
  const me = await prisma.ecomProduct.findUnique({ where: { id: productId }, select: { variantGroup: true } });
  if (!me?.variantGroup) return [];
  const rows = (await prisma.ecomProduct.findMany({
    where: { variantGroup: me.variantGroup, ...(onlyActive ? { status: "active" } : {}) },
    select: SELECT,
    take: 60,
  })) as Row[];
  return sortVariants(rows.map(toVariant));
}

/**
 * Makes `productId` and `ids` one variant group — linked both ways, so every
 * product in the group lists all the others. Products that were in this
 * product's group but are no longer in `ids` are unlinked. A product added
 * from another group brings that whole group along.
 */
export async function setVariants(productId: number, ids: number[]) {
  const want = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0 && n !== productId))].slice(0, 50);
  const me = await prisma.ecomProduct.findUnique({ where: { id: productId }, select: { variantGroup: true } });
  if (!me) return;
  const old = me.variantGroup;

  if (want.length === 0) {
    if (old === null) return;
    await prisma.ecomProduct.update({ where: { id: productId }, data: { variantGroup: null } });
    await dissolveIfAlone(old);
    return;
  }

  const others = (await prisma.ecomProduct.findMany({ where: { id: { in: want } }, select: { id: true, variantGroup: true } })) as { id: number; variantGroup: number | null }[];
  const group = old ?? others.find((o) => o.variantGroup !== null)?.variantGroup ?? productId;
  const mergeGroups = [...new Set(others.map((o) => o.variantGroup).filter((g): g is number => g !== null && g !== group))];

  await prisma.$transaction([
    // Members removed in the form leave the group.
    ...(old !== null
      ? [prisma.ecomProduct.updateMany({ where: { variantGroup: old, id: { notIn: [productId, ...others.map((o) => o.id)] } }, data: { variantGroup: null } })]
      : []),
    ...(mergeGroups.length ? [prisma.ecomProduct.updateMany({ where: { variantGroup: { in: mergeGroups } }, data: { variantGroup: group } })] : []),
    prisma.ecomProduct.updateMany({ where: { id: { in: [productId, ...others.map((o) => o.id)] } }, data: { variantGroup: group } }),
  ]);
}

/** Removes one product from its group (and clears a group left with a single product). */
export async function unlinkVariant(productId: number) {
  const me = await prisma.ecomProduct.findUnique({ where: { id: productId }, select: { variantGroup: true } });
  if (!me?.variantGroup) return;
  await prisma.ecomProduct.update({ where: { id: productId }, data: { variantGroup: null } });
  await dissolveIfAlone(me.variantGroup);
}

async function dissolveIfAlone(group: number) {
  const left = await prisma.ecomProduct.count({ where: { variantGroup: group } });
  if (left === 1) await prisma.ecomProduct.updateMany({ where: { variantGroup: group }, data: { variantGroup: null } });
}

/** Products to link as variants: search by name / ID / barcode / SKU, optionally one brand or category. */
export async function searchVariantCandidates(opts: { q: string; brandId?: number | null; categoryId?: number | null; exclude?: number | null }) {
  const q = opts.q.trim();
  const id = /^\d+$/.test(q) && q.length <= 9 ? Number(q) : null;
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  const rows = (await prisma.ecomProduct.findMany({
    where: {
      ...(opts.exclude ? { NOT: { id: opts.exclude } } : {}),
      ...(opts.brandId ? { brandId: opts.brandId } : {}),
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      ...(q
        ? {
            OR: [
              ...(id ? [{ id }] : []),
              { barcode: q },
              { sku: q },
              { AND: words.map((w) => ({ name: { contains: w } })) },
            ],
          }
        : {}),
    },
    select: SELECT,
    orderBy: { name: "asc" },
    take: 30,
  })) as Row[];
  return rows.map(toVariant);
}
