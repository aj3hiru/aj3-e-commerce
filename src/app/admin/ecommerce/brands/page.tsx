import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BrandsTable } from "@/components/admin/BrandsTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface BrandsPageProps {
  searchParams: Promise<{ success?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Brand created successfully!",
  updated: "Brand updated successfully!",
};

export default async function BrandsPage({ searchParams }: BrandsPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }
  const params = await searchParams;
  const brands = await prisma.ecomBrand.findMany({ orderBy: { id: "desc" } });

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Brands"
      pageSubtitle="Manage product brands"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success && SUCCESS_MESSAGES[params.success] && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          {SUCCESS_MESSAGES[params.success]}
        </div>
      )}
      <BrandsTable
        brands={brands.map((b: (typeof brands)[number]) => ({
          id: b.id, name: b.name, slug: b.slug, logo: b.logo, isPopular: b.isPopular, status: b.status,
        }))}
      />
    </AdminShell>
  );
}
