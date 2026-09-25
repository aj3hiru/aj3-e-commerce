import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Orders2Body, Orders2HeaderButtons } from "@/components/admin/orders2/Orders2Body";
import { ORDERS2_GROUPS, ORDERS2_PREF_KEY, ORDERS2_STANDALONE } from "@/components/admin/orders2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getOrders2Data, parseOrderRange, parseOrderType } from "@/lib/orders2";

/**
 * /admin/ecommerce/orders — a redesign of All Orders, kept alongside
 * /admin/ecommerce/orders. Same access rule, no database change.
 *
 * All five sidebar entries are this one page:
 *   All Orders        → /admin/ecommerce/orders
 *   Pending Orders    → /admin/ecommerce/orders?type=Pending
 *   Progress Orders   → /admin/ecommerce/orders?type=In+Progress
 *   Delivered Orders  → /admin/ecommerce/orders?type=Delivered
 *   Canceled Orders   → /admin/ecommerce/orders?type=Canceled
 * — exactly as the old page works, so the links keep their meaning. The tabs
 * on the page move between them.
 *
 * Status and payment changes go through the existing
 * /api/ecommerce/orders/[id] endpoint, so both pages behave identically.
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Orders2Page({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "orders", "view")) {
    redirect("/shop/login");
  }

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const type = parseOrderType(first(sp.type));
  const range = parseOrderRange({ from: first(sp.from), to: first(sp.to) });
  const data = await getOrders2Data(type, range);

  return (
    <DashboardWidgetPrefsProvider prefKey={ORDERS2_PREF_KEY} groups={ORDERS2_GROUPS} standalone={ORDERS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle={type ? `${type} Orders` : "All Orders"}
        pageSubtitle="Online orders from the shop, with their status and payment"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <Orders2HeaderButtons />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <Orders2HeaderButtons />
        </div>
        <Orders2Body
          data={data}
          canEdit={hasPermission(session.permissions, "orders", "update_status") || hasPermission(session.permissions, "orders", "mark_paid")}
          canBill={hasPermission(session.permissions, "ecommerce", "manage_billing")}
        />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
