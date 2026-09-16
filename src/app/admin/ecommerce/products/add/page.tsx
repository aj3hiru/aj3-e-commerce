import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { ProductCreateForm } from "@/components/admin/ProductCreateForm";

export default async function AddProductPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) redirect("/shop/login");

  const [categories, brands, tags] = await Promise.all([
    prisma.ecomCategory.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ecomBrand.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.ecomProductTag.findMany({ where: { status: "active" }, orderBy: { sortOrder: "asc" }, select: { slug: true, label: true, tagGroup: true } }),
  ]);

  return (
    <AdminShell siteName="EduMint24" pageTitle="Add Product" pageSubtitle="Create a product for your store" username={session.username} role={session.role} permissions={session.permissions}>
      <div className="mb-4"><Link href="/admin/ecommerce/products" className="text-sm text-admin-primary hover:underline">← Back to Products</Link></div>
      <ProductCreateForm categories={categories} brands={brands} tags={tags} />
    </AdminShell>
  );
}
