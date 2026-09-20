import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, PackageX } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { AddProduct2Form, type AP2Product } from "@/components/admin/add-product2/AddProduct2Form";
import { ADD2_GROUPS, ADD2_PREF_KEY, ADD2_STANDALONE } from "@/components/admin/add-product2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface AddProduct2PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * /admin/ecommerce/add-product2 — a trial redesign of Add Product that also
 * edits (?edit=ID), kept alongside /admin/ecommerce/products/add so the two
 * can be compared (same idea as products2, dashboard2, billing2). Follows
 * admin/ecommerce/add-product-form.php: sub-categories, GST rates from
 * settings, gallery, duplicate-barcode check, automatic EM barcode, and
 * "+ Add new" brand / item type without leaving the page.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/add-product2/
 *   src/components/admin/add-product2/
 *   src/app/api/ecommerce/products2/
 *   src/lib/product2-save.ts
 * (and point products2's links back to /admin/ecommerce/products/add).
 */
export default async function AddProduct2Page({ searchParams }: AddProduct2PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }

  const sp = await searchParams;
  const editRaw = Array.isArray(sp.edit) ? sp.edit[0] : sp.edit;
  const editId = editRaw && /^\d+$/.test(editRaw) ? Number(editRaw) : null;

  const [categories, subcategories, brands, tags, gstRows, found] = await Promise.all([
    prisma.ecomCategory.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ecomSubcategory.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, categoryId: true } }),
    prisma.ecomBrand.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ecomProductTag.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { slug: true, label: true, tagGroup: true, status: true } }),
    prisma.ecomGstRate.findMany({ orderBy: { rate: "asc" }, select: { label: true, rate: true, isDefault: true } }),
    editId
      ? prisma.ecomProduct.findUnique({
          where: { id: editId },
          include: {
            images: { orderBy: { sortOrder: "asc" }, select: { id: true, image: true } },
            category: { select: { id: true, name: true } },
            subcategory: { select: { id: true, name: true, categoryId: true } },
            brand: { select: { id: true, name: true } },
          },
        })
      : null,
  ]);

  type Tag = { slug: string; label: string; tagGroup: string; status: string };
  const tagRows = tags as Tag[];
  // Same rule as the PHP: active tags, plus the built-in "none" / "normal".
  const badges = tagRows.filter((t) => t.tagGroup === "badge" && (t.status === "active" || t.slug === "none")).map((t) => ({ slug: t.slug, label: t.label }));
  const itemTypes = tagRows.filter((t) => t.tagGroup === "item_type" && (t.status === "active" || t.slug === "normal")).map((t) => ({ slug: t.slug, label: t.label }));
  const gstRates = (gstRows as { label: string; rate: unknown; isDefault: boolean }[]).map((g) => ({ label: g.label, rate: Number(g.rate), isDefault: g.isDefault }));

  type Found = {
    id: number; name: string; slug: string; sku: string | null; hsnCode: string | null; barcode: string | null; description: string | null;
    categoryId: number | null; subcategoryId: number | null; brandId: number | null; unit: string | null; productType: string;
    price: unknown; salePrice: unknown; gstRate: unknown; stockQty: number | null; image: string | null; badgeTag: string; itemType: string;
    status: string; downloadLink: string | null; licenseKey: string | null; affiliateUrl: string | null; isCampaign: boolean;
    campaignPrice: unknown; showOnHome: boolean; images: { id: number; image: string }[];
    category: { id: number; name: string } | null; subcategory: { id: number; name: string; categoryId: number } | null; brand: { id: number; name: string } | null;
  };
  const f = found as Found | null;
  const optNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  const product: AP2Product | null = f
    ? {
        id: f.id, name: f.name, slug: f.slug, sku: f.sku, hsnCode: f.hsnCode, barcode: f.barcode, description: f.description,
        categoryId: f.categoryId, subcategoryId: f.subcategoryId, brandId: f.brandId, unit: f.unit, productType: f.productType,
        price: Number(f.price), salePrice: optNum(f.salePrice), gstRate: Number(f.gstRate), stockQty: f.stockQty, image: f.image,
        badgeTag: f.badgeTag, itemType: f.itemType, status: f.status, downloadLink: f.downloadLink, licenseKey: f.licenseKey,
        affiliateUrl: f.affiliateUrl, isCampaign: f.isCampaign, campaignPrice: optNum(f.campaignPrice), showOnHome: f.showOnHome,
        gallery: f.images,
      }
    : null;

  // An edited product may point at a category/brand that has since been
  // deactivated — keep it in the lists so saving doesn't silently drop it.
  const cats = categories as { id: number; name: string }[];
  const subs = subcategories as { id: number; name: string; categoryId: number }[];
  const brs = brands as { id: number; name: string }[];
  if (f?.category && !cats.some((c) => c.id === f.category!.id)) cats.push(f.category);
  if (f?.subcategory && !subs.some((c) => c.id === f.subcategory!.id)) subs.push(f.subcategory);
  if (f?.brand && !brs.some((b) => b.id === f.brand!.id)) brs.push(f.brand);

  const notFound = editId !== null && !f;
  const title = product ? "Edit Product" : "Add Product";
  const subtitle = product ? `Update “${product.name}”` : "Fill in the details for your new product";

  return (
    <DashboardWidgetPrefsProvider prefKey={ADD2_PREF_KEY} groups={ADD2_GROUPS} standalone={ADD2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle={title}
        pageSubtitle={subtitle}
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <Link
              href="/admin/ecommerce/products2"
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Products
            </Link>
            <DisplayOptionsPanel variant="header" />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 xl:hidden">
          <Link
            href="/admin/ecommerce/products2"
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] hover:bg-[#f9fafb]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Products
          </Link>
          <DisplayOptionsPanel variant="toolbar" />
        </div>

        {notFound ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-admin-gray-200 bg-white px-6 py-16 text-center shadow-sm">
            <PackageX className="h-10 w-10 text-admin-gray-300" />
            <h2 className="text-lg font-semibold text-admin-gray-900">Product not found</h2>
            <p className="max-w-md text-sm text-admin-gray-500">Product #{editId} doesn&apos;t exist — it may have been deleted.</p>
            <div className="mt-2 flex gap-2">
              <Link href="/admin/ecommerce/products2" className="flex h-10 items-center rounded-[0.5rem] border border-[#e5e7eb] bg-white px-4 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]">All Products</Link>
              <Link href="/admin/ecommerce/add-product2" className="flex h-10 items-center rounded-[0.5rem] bg-admin-primary px-4 text-sm font-semibold text-white hover:bg-admin-primary-dark">Add a new product</Link>
            </div>
          </div>
        ) : (
          <AddProduct2Form
            // A new key per product so switching between edits never reuses old form state.
            key={product?.id ?? "new"}
            product={product}
            categories={cats}
            subcategories={subs}
            brands={brs}
            badges={badges}
            itemTypes={itemTypes}
            gstRates={gstRates}
          />
        )}
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
