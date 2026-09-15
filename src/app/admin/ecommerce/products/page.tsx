import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ProductsTable } from "@/components/admin/ProductsTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface ProductsPageProps {
  searchParams: Promise<{ success?: string; error?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Product created successfully!",
  updated: "Product updated successfully!",
  deleted: "Product deleted successfully!",
};

/** Verified against admin/ecommerce/products.php — stat mini-grid, notifications
 *  banner, and the full products table. */
export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }

  const params = await searchParams;

  const [products, badgeTagRows] = await Promise.all([
    prisma.ecomProduct.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.ecomProductTag.findMany({ where: { tagGroup: "badge" }, select: { slug: true, label: true, color: true } }),
  ]);

  const badgeLabels: Record<string, string> = {};
  const badgeColors: Record<string, string | null> = {};
  for (const bt of badgeTagRows) {
    badgeLabels[bt.slug] = bt.label;
    badgeColors[bt.slug] = bt.color;
  }

  const totalAll = products.length;
  const totalActive = products.filter((p: (typeof products)[number]) => p.status === "active").length;
  const totalOutstock = products.filter(
    (p: (typeof products)[number]) => p.productType === "physical" && (p.stockQty ?? 0) <= 0
  ).length;

  const successMessage = params.success ? SUCCESS_MESSAGES[params.success] : undefined;

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="All Products"
      pageSubtitle="Manage everything you sell in your store"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          {successMessage}
        </div>
      )}
      {params.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-2.5 mb-4">
          Delete failed. Please try again.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-admin-gray-900">{totalAll.toLocaleString("en-IN")}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Total Products</div>
        </div>
        <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-emerald-600">{totalActive.toLocaleString("en-IN")}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Published</div>
        </div>
        <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-red-600">{totalOutstock.toLocaleString("en-IN")}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Out of Stock</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">All Products</h3>
        <Link
          href="/admin/ecommerce/products/add"
          className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-3.5 py-2"
        >
          <Plus className="w-4 h-4" /> Add
        </Link>
      </div>

      <ProductsTable
        products={products.map((p: (typeof products)[number]) => ({
          id: p.id,
          name: p.name,
          image: p.image,
          price: Number(p.price),
          salePrice: p.salePrice ? Number(p.salePrice) : null,
          status: p.status,
          productType: p.productType,
          itemType: p.itemType,
          stockQty: p.stockQty,
          badgeTag: p.badgeTag,
        }))}
        badgeLabels={badgeLabels}
        badgeColors={badgeColors}
      />
    </AdminShell>
  );
}
