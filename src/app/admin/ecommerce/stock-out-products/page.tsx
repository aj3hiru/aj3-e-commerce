import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { StockOutTable } from "@/components/admin/StockOutTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface StockOutPageProps {
  searchParams: Promise<{ success?: string }>;
}

export default async function StockOutProductsPage({ searchParams }: StockOutPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }
  const params = await searchParams;

  const products = await prisma.ecomProduct.findMany({
    where: { productType: "physical", OR: [{ stockQty: null }, { stockQty: { lte: 0 } }] },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Stock Out Products"
      pageSubtitle="Physical products that are currently out of stock"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success === "restocked" && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          Stock updated successfully!
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-bold text-lg">Stock Out Products</h3>
        <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2.5 py-1">{products.length}</span>
      </div>

      <StockOutTable
        products={products.map((p: (typeof products)[number]) => ({ id: p.id, name: p.name, sku: p.sku, price: Number(p.price) }))}
      />
    </AdminShell>
  );
}
