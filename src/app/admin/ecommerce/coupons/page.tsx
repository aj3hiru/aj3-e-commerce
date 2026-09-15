import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CouponsTable } from "@/components/admin/CouponsTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface CouponsPageProps {
  searchParams: Promise<{ success?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Coupon created successfully!",
  updated: "Coupon updated successfully!",
  deleted: "Coupon deleted successfully!",
};

export default async function CouponsPage({ searchParams }: CouponsPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_coupons")) {
    redirect("/shop/login");
  }
  const params = await searchParams;

  const [coupons, products, categories, subcategories] = await Promise.all([
    prisma.ecomCoupon.findMany({ orderBy: { id: "desc" } }),
    prisma.ecomProduct.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ecomCategory.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ecomSubcategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Coupons"
      pageSubtitle="Create and manage discount codes"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success && SUCCESS_MESSAGES[params.success] && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          {SUCCESS_MESSAGES[params.success]}
        </div>
      )}
      <CouponsTable
        coupons={coupons.map((c: (typeof coupons)[number]) => ({
          id: c.id, title: c.title, code: c.code, numberOfTimes: c.numberOfTimes, usedCount: c.usedCount,
          discountType: c.discountType, discountValue: Number(c.discountValue), appliesTo: c.appliesTo,
          productId: c.productId, categoryId: c.categoryId, subcategoryId: c.subcategoryId, status: c.status,
        }))}
        products={products}
        categories={categories}
        subcategories={subcategories}
      />
    </AdminShell>
  );
}
