import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Brands2Body, Brands2HeaderButtons, type Brand2Row } from "@/components/admin/brands2/Brands2Body";
import { BRANDS2_GROUPS, BRANDS2_PREF_KEY, BRANDS2_STANDALONE } from "@/components/admin/brands2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/**
 * /admin/ecommerce/brands2 — a trial redesign of Brands, kept alongside
 * /admin/ecommerce/brands so the two can be compared (same idea as
 * products2 / add-product2). Keeps the current page's "sheet" table look.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/brands2/
 *   src/components/admin/brands2/
 *   src/app/api/ecommerce/brands2/
 *   src/lib/brand2-save.ts
 */
export default async function Brands2Page() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }

  const rows = await prisma.ecomBrand.findMany({
    orderBy: { id: "desc" },
    select: { id: true, name: true, slug: true, logo: true, isPopular: true, status: true, _count: { select: { products: true } } },
  });
  const brands: Brand2Row[] = (rows as {
    id: number; name: string; slug: string; logo: string | null; isPopular: boolean; status: string; _count: { products: number };
  }[]).map((b) => ({ id: b.id, name: b.name, slug: b.slug, logo: b.logo, isPopular: b.isPopular, status: b.status, products: b._count.products }));

  return (
    <DashboardWidgetPrefsProvider prefKey={BRANDS2_PREF_KEY} groups={BRANDS2_GROUPS} standalone={BRANDS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Brands"
        pageSubtitle="Manage the brands products can be tagged with"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <Brands2HeaderButtons />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <Brands2HeaderButtons />
        </div>
        <Brands2Body brands={brands} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
