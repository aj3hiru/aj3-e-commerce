import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SubcategoriesTable } from "@/components/admin/SubcategoriesTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface SubcategoriesPageProps {
  searchParams: Promise<{ success?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Sub category created successfully!",
  updated: "Sub category updated successfully!",
};

export default async function SubcategoriesPage({ searchParams }: SubcategoriesPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    redirect("/staff/login");
  }
  const params = await searchParams;

  const [subcategories, categories] = await Promise.all([
    prisma.ecomSubcategory.findMany({ include: { category: { select: { name: true } } }, orderBy: { id: "desc" } }),
    prisma.ecomCategory.findMany({ where: { status: "active" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Sub Categories"
      pageSubtitle="Group products more finely within a category"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success && SUCCESS_MESSAGES[params.success] && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          {SUCCESS_MESSAGES[params.success]}
        </div>
      )}

      <SubcategoriesTable
        subcategories={subcategories.map((s: (typeof subcategories)[number]) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          status: s.status,
          categoryId: s.categoryId,
          categoryName: s.category.name,
        }))}
        categories={categories.map((c: (typeof categories)[number]) => ({ id: c.id, name: c.name }))}
      />
    </AdminShell>
  );
}
