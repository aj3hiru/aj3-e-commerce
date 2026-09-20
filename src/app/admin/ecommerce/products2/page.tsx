import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import {
  Products2AddButton, Products2Body, Products2ExportMenu, Products2HeaderSearch, Products2Provider, type Product2Row,
} from "@/components/admin/products2/Products2Body";
import { parseProducts2Filters } from "@/components/admin/products2/filters";
import { PRODUCTS2_GROUPS, PRODUCTS2_PREF_KEY, PRODUCTS2_STANDALONE } from "@/components/admin/products2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
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

  const [products, tags, categoryRows] = await Promise.all([
    prisma.ecomProduct.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, image: true, sku: true, barcode: true, price: true, salePrice: true,
        status: true, productType: true, stockQty: true, badgeTag: true, itemType: true, unit: true, createdAt: true,
        categoryId: true, category: { select: { name: true } },
      },
    }),
    prisma.ecomProductTag.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, label: true, color: true, tagGroup: true },
    }),
    prisma.ecomCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  type TagRow = { slug: string; label: string; color: string | null; tagGroup: string };
  const badges = (tags as TagRow[]).filter((t) => t.tagGroup === "badge").map((t) => ({ slug: t.slug, label: t.label, color: t.color }));
  const itemTypes = (tags as TagRow[]).filter((t) => t.tagGroup === "item_type").map((t) => ({ slug: t.slug, label: t.label }));

  const rows: Product2Row[] = products.map((p: {
    id: number; name: string; image: string | null; sku: string | null; barcode: string | null; price: unknown;
    salePrice: unknown; status: string; productType: string; stockQty: number | null; badgeTag: string;
    itemType: string; unit: string | null; createdAt: Date; categoryId: number | null; category: { name: string } | null;
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
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    createdAt: p.createdAt.toISOString(),
  }));

  const categories = (categoryRows as { id: number; name: string }[]).map((c) => ({ id: c.id, name: c.name }));

  return (
    // The provider wraps the shell: the header's search and Export work on the
    // same product list, filters and selection as the table below.
    <DashboardWidgetPrefsProvider prefKey={PRODUCTS2_PREF_KEY} groups={PRODUCTS2_GROUPS} standalone={PRODUCTS2_STANDALONE}>
    <Products2Provider products={rows} badges={badges} itemTypes={itemTypes} categories={categories} initialFilters={initialFilters}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="All Products"
        pageSubtitle="Manage everything you sell in your store"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <Products2HeaderSearch className="w-[190px] min-[1440px]:w-[240px] min-[1600px]:w-[300px]" />
            <DisplayOptionsPanel variant="header" />
            <Products2ExportMenu />
            <Products2AddButton />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center gap-3 xl:hidden">
          <Products2HeaderSearch className="w-full sm:w-auto sm:min-w-[240px] sm:flex-1" />
          <DisplayOptionsPanel variant="toolbar" />
          <Products2ExportMenu />
          <Products2AddButton />
        </div>

        <Products2Body />
      </AdminShell>
    </Products2Provider>
    </DashboardWidgetPrefsProvider>
  );
}
