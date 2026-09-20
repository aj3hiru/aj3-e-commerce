import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { GlobalSearchBar } from "@/components/admin/GlobalSearchBar";
import { Products2Body, type Product2Row } from "@/components/admin/products2/Products2Body";
import { parseProducts2Filters } from "@/components/admin/products2/filters";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/**
 * /admin/ecommerce/products2 — a trial redesign of All Products, kept
 * alongside the original /admin/ecommerce/products so the two can be compared
 * (same idea as dashboard2, billing2, sales-history2). Same access rule
 * (manage_products), same data, same publish/delete/barcode endpoints; header
 * and sidebar are the shared AdminShell.
 *
 * All products are sent once and every filter runs in the browser, so
 * filtering is instant with no server round-trip.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/products2/
 *   src/components/admin/products2/
 * Nothing else imports them.
 */
interface Products2PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Products2Page({ searchParams }: Products2PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }

  const initialFilters = parseProducts2Filters(await searchParams);

  const [products, tags] = await Promise.all([
    prisma.ecomProduct.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, image: true, sku: true, barcode: true, price: true, salePrice: true,
        status: true, productType: true, stockQty: true, badgeTag: true, itemType: true, unit: true, createdAt: true,
      },
    }),
    prisma.ecomProductTag.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, label: true, color: true, tagGroup: true },
    }),
  ]);

  type TagRow = { slug: string; label: string; color: string | null; tagGroup: string };
  const badges = (tags as TagRow[]).filter((t) => t.tagGroup === "badge").map((t) => ({ slug: t.slug, label: t.label, color: t.color }));
  const itemTypes = (tags as TagRow[]).filter((t) => t.tagGroup === "item_type").map((t) => ({ slug: t.slug, label: t.label }));

  const rows: Product2Row[] = products.map((p: {
    id: number; name: string; image: string | null; sku: string | null; barcode: string | null; price: unknown;
    salePrice: unknown; status: string; productType: string; stockQty: number | null; badgeTag: string;
    itemType: string; unit: string | null; createdAt: Date;
  }) => ({
    id: p.id,
    name: p.name,
    image: p.image,
    sku: p.sku,
    barcode: p.barcode,
    price: Number(p.price),
    salePrice: p.salePrice === null || p.salePrice === undefined ? null : Number(p.salePrice),
    status: p.status,
    productType: p.productType,
    stockQty: p.stockQty,
    badgeTag: p.badgeTag,
    itemType: p.itemType,
    unit: p.unit,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="All Products"
      pageSubtitle="Manage everything you sell in your store"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
      headerActions={
        <div className="hidden w-[280px] xl:block">
          <GlobalSearchBar variant="toolbar" />
        </div>
      }
    >
      <Products2Body products={rows} badges={badges} itemTypes={itemTypes} initialFilters={initialFilters} />
    </AdminShell>
  );
}
