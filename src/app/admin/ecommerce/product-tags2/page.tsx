import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Tags2Body, Tags2HeaderButtons } from "@/components/admin/product-tags2/ProductTags2Body";
import { TAGS2_GROUPS, TAGS2_PREF_KEY, TAGS2_STANDALONE } from "@/components/admin/product-tags2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getTags2Data, parseTagRange } from "@/lib/product-tags2";

/**
 * /admin/ecommerce/product-tags2 — "Badge Tags & Item Types", with how many
 * products use each tag and how much each one has sold.
 *
 * Reads and writes the existing ecom_product_tags table, so no database
 * change is needed. Products store a tag's slug, so renaming one moves its
 * products across in the same transaction (see the API route).
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductTags2Page({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = parseTagRange({ from: first(sp.from), to: first(sp.to) });
  const data = await getTags2Data(range);

  return (
    <DashboardWidgetPrefsProvider prefKey={TAGS2_PREF_KEY} groups={TAGS2_GROUPS} standalone={TAGS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Badge Tags & Item Types"
        pageSubtitle="The labels on your products, and how much each one sells"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <Tags2HeaderButtons />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <Tags2HeaderButtons />
        </div>
        <Tags2Body data={data} range={range} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
