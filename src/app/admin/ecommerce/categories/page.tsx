import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CategoriesTable } from "@/components/admin/CategoriesTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface CategoriesPageProps {
  searchParams: Promise<{ success?: string; error?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Category created successfully!",
  updated: "Category updated successfully!",
  deleted: "Category deleted successfully!",
};

/** Verified against admin/ecommerce/categories.php. */
export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const categories = await prisma.ecomCategory.findMany({ orderBy: { createdAt: "desc" } });
  const successMessage = params.success ? SUCCESS_MESSAGES[params.success] : undefined;

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Categories"
      pageSubtitle="Organize your product catalog"
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
          Delete failed: this category may still have subcategories linked to it.
        </div>
      )}

      <CategoriesTable
        categories={categories.map((c: (typeof categories)[number]) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          image: c.image,
          metaKeywords: c.metaKeywords,
          metaDescription: c.metaDescription,
          serial: c.serial,
          status: c.status,
        }))}
      />
    </AdminShell>
  );
}
