import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Categories2Body, Categories2HeaderButtons, type Category2Row } from "@/components/admin/categories2/Categories2Body";
import { CATEGORIES2_GROUPS, CATEGORIES2_PREF_KEY, CATEGORIES2_STANDALONE } from "@/components/admin/categories2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/**
 * /admin/ecommerce/categories2 — a trial redesign of Categories, kept
 * alongside /admin/ecommerce/categories so the two can be compared (same
 * idea as products2, brands2, orders2, ...). Same access rule
 * (manage_categories), same data, same create/update/delete endpoints
 * underneath (via category2-save.ts); header and sidebar are the shared
 * AdminShell.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/categories2/
 *   src/components/admin/categories2/
 *   src/app/api/ecommerce/categories2/
 *   src/lib/category2-save.ts
 * (the ecom_categories.updated_at column added for this page's "Last
 * Updated" can stay — nothing else needs it removed).
 */
export default async function Categories2Page() {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (!hasPermission(session.permissions, "ecommerce", "manage_categories")) redirect("/admin/dashboard?denied=1");

  const rows = await prisma.ecomCategory.findMany({
    orderBy: { id: "desc" },
    select: {
      id: true, name: true, slug: true, image: true, metaKeywords: true, metaDescription: true,
      serial: true, status: true, updatedAt: true, _count: { select: { products: true } },
    },
  });

  const categories: Category2Row[] = (rows as {
    id: number; name: string; slug: string; image: string | null; metaKeywords: string | null;
    metaDescription: string | null; serial: number; status: string; updatedAt: Date | null;
    _count: { products: number };
  }[]).map((c) => ({
    id: c.id, name: c.name, slug: c.slug, image: c.image, metaKeywords: c.metaKeywords,
    metaDescription: c.metaDescription, serial: c.serial, status: c.status,
    products: c._count.products, updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
  }));

  return (
    <DashboardWidgetPrefsProvider prefKey={CATEGORIES2_PREF_KEY} groups={CATEGORIES2_GROUPS} standalone={CATEGORIES2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Categories"
        pageSubtitle="Manage and organize your product catalog"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <Categories2HeaderButtons />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <Categories2HeaderButtons />
        </div>
        <Categories2Body categories={categories} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
