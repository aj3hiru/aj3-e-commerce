import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { StockOut2Body, StockOut2HeaderButtons, type StockOut2Row } from "@/components/admin/stock-out2/StockOut2Body";
import { STOCKOUT2_GROUPS, STOCKOUT2_PREF_KEY, STOCKOUT2_STANDALONE } from "@/components/admin/stock-out2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/**
 * /admin/ecommerce/stock-out-products — a trial redesign of Stock Out
 * Products, kept alongside /admin/ecommerce/stock-out-products so the two can
 * be compared (same idea as products2 / brands2 / sales-history2). Same access
 * rule (manage_products) and the same "out of stock" rule as the original: a
 * physical product whose stock is 0 or not set. Keeps the current page's
 * "sheet" table look.
 *
 * Everything on the page comes from the database — products, their Sizes /
 * Units, categories. The list is sent once and every filter, search and sort
 * runs in the browser, so it's instant.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/stock-out-products/
 *   src/components/admin/stock-out2/
 *   src/app/api/ecommerce/stock-out2/
 * (and, if you like, the small `from=` support in add-product2).
 */
interface StockOut2PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StockOutProducts2Page({ searchParams }: StockOut2PageProps) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (!hasPermission(session.permissions, "ecommerce", "manage_products")) redirect("/admin/dashboard?denied=1");

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Set by Edit Product 2 after a save (it returns here when opened from this page).
  const savedName = first(sp.name)?.slice(0, 120);
  const notice = first(sp.success) === "updated" ? `${savedName ? `“${savedName}”` : "Product"} updated.` : null;

  const products = await prisma.ecomProduct.findMany({
    where: { productType: "physical", OR: [{ stockQty: null }, { stockQty: { lte: 0 } }] },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, image: true, sku: true, barcode: true, price: true, salePrice: true, status: true,
      stockQty: true, unit: true, categoryId: true,
      category: { select: { name: true } },
      brand: { select: { name: true } },
      sizes: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, mrp: true, price: true, stockQty: true, isDefault: true } },
    },
  });

  const rows: StockOut2Row[] = (products as {
    id: number; name: string; image: string | null; sku: string | null; barcode: string | null; price: unknown; salePrice: unknown;
    status: string; stockQty: number | null; unit: string | null; categoryId: number | null;
    category: { name: string } | null; brand: { name: string } | null;
    sizes: { id: number; label: string; mrp: unknown; price: unknown; stockQty: number | null; isDefault: boolean }[];
  }[]).map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image,
    sku: p.sku,
    barcode: p.barcode,
    price: Number(p.price),
    salePrice: p.salePrice === null || p.salePrice === undefined ? null : Number(p.salePrice),
    status: p.status,
    stockQty: p.stockQty,
    unit: p.unit,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    brandName: p.brand?.name ?? null,
    sizes: p.sizes.map((z) => ({
      id: z.id,
      label: z.label,
      mrp: Number(z.mrp),
      price: z.price === null || z.price === undefined ? null : Number(z.price),
      stockQty: z.stockQty,
      isDefault: z.isDefault,
    })),
  }));

  return (
    <DashboardWidgetPrefsProvider prefKey={STOCKOUT2_PREF_KEY} groups={STOCKOUT2_GROUPS} standalone={STOCKOUT2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Stock Out Products"
        pageSubtitle="Physical products that are currently out of stock"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <StockOut2HeaderButtons />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <StockOut2HeaderButtons />
        </div>
        <StockOut2Body products={rows} notice={notice} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
