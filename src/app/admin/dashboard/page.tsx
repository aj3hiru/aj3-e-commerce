import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { GlobalSearchBar } from "@/components/admin/GlobalSearchBar";
import { RangeFilter } from "@/components/admin/dashboard/RangeFilter";
import { Dashboard2Body } from "@/components/admin/dashboard/Dashboard2Body";
import { DASHBOARD2_GROUPS, DASHBOARD2_PREF_KEY, DASHBOARD2_STANDALONE } from "@/components/admin/dashboard/widgets";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession } from "@/lib/admin-auth";
import { resolveDashboardRange } from "@/lib/dashboard-range";
import { getDashboard2Stats } from "@/lib/dashboard2-stats";
import { BadgePercent, Boxes, ClipboardList, HandCoins, LayoutTemplate, PackagePlus, Receipt, Truck } from "lucide-react";
import { BillingDashboard, CatalogDashboard, MarketingDashboard, OrderDeskDashboard, Welcome } from "@/components/admin/dashboard/RoleDashboards";
import { billingData, catalogData, marketingData, orderDeskData } from "@/lib/role-dashboards";

interface Dashboard2PageProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}

/**
 * /admin/dashboard — a trial redesign of the e-commerce dashboard, kept
 * alongside the original so the two can be compared. Same data, same access
 * rule, same sidebar and header; only the body layout differs.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/dashboard/
 *   src/components/admin/dashboard/
 *   src/lib/dashboard2-stats.ts
 * Nothing else imports them.
 */
export default async function Dashboard2Page({ searchParams }: Dashboard2PageProps) {
  const session = await getAdminSession();
  // Same gate as the original dashboard: top-level `dashboard_access`.
  if (!session || !(session.permissions as unknown as Record<string, boolean>).dashboard_access) {
    redirect("/shop/login");
  }

  // Each role gets its own dashboard; admins and store managers keep the full store dashboard.
  const roleView = await roleDashboard(session);
  if (roleView) return roleView;

  const params = await searchParams;
  const range = resolveDashboardRange(params.range, params.from, params.to);
  const stats = await getDashboard2Stats(range);

  const filterProps = {
    currentRange: range.range,
    rangeLabel: range.rangeLabel,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  };

  return (
    // The provider wraps the whole shell because the Display Options control
    // lives in the header while the cards it hides live in the body.
    <DashboardWidgetPrefsProvider
      prefKey={DASHBOARD2_PREF_KEY}
      groups={DASHBOARD2_GROUPS}
      standalone={DASHBOARD2_STANDALONE}
    >
      <AdminShell
        siteName="EduMint24"
        pageTitle="E-commerce Dashboard"
        pageSubtitle="A live overview of your store"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          // In the header from 1280px up. The full segmented bar needs ~470px,
          // which only fits beside the search box and user menu from 1800px;
          // between those widths the same filter collapses to one button.
          // The search box is grouped in here (not passed via AdminShell's
          // own `showSearch`) so it picks up the "toolbar" variant and sits
          // flush — same height, same pill treatment — with its neighbours,
          // instead of the shorter PHP-matched box AdminHeader would render
          // for `showSearch` on its own.
          <div className="hidden items-center gap-3 xl:flex">
            <div className="hidden min-[1800px]:block">
              <RangeFilter mode="segmented" {...filterProps} />
            </div>
            <div className="min-[1800px]:hidden">
              <RangeFilter mode="compact" {...filterProps} />
            </div>
            <DisplayOptionsPanel variant="header" />
            <GlobalSearchBar variant="toolbar" />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move to
            a toolbar at the top of the page instead of vanishing. */}
        <div className="mb-6 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <RangeFilter mode="compact" {...filterProps} />
          <DisplayOptionsPanel variant="toolbar" />
          <GlobalSearchBar variant="toolbar" />
        </div>

        <Dashboard2Body stats={stats} rangeLabel={range.rangeLabel} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}

async function roleDashboard(session: NonNullable<Awaited<ReturnType<typeof getAdminSession>>>) {
  const p = session.permissions;
  const role = session.role;
  if (role === "admin" || role === "manager") return null;
  const shell = { siteName: "EduMint24", username: session.username, role: session.role, permissions: p };
  const name = session.username;

  if (role === "delivery_agent" || (p.delivery?.deliver && !p.orders?.view && !p.ecommerce?.manage_billing)) redirect("/admin/deliveries");

  if (role === "order_manager" || (p.orders?.view && !p.ecommerce?.manage_billing && !p.ecommerce?.manage_products)) {
    const d = await orderDeskData();
    return (
      <AdminShell {...shell} pageTitle="Order Desk" pageSubtitle="New orders, deliveries and today's numbers">
        <Welcome name={name} role={role} actions={[{ href: "/admin/ecommerce/orders?type=Pending", label: "Pending orders", icon: ClipboardList, primary: true }, { href: "/admin/deliveries?view=all", label: "Deliveries board", icon: Truck }]} />
        <OrderDeskDashboard d={d} canAccept={!!p.orders?.accept_reject} />
      </AdminShell>
    );
  }
  if (role === "cashier" || (p.ecommerce?.manage_billing && !p.ecommerce?.manage_products)) {
    const d = await billingData();
    return (
      <AdminShell {...shell} pageTitle="Billing" pageSubtitle="Today at the counter">
        <Welcome name={name} role={role} actions={[{ href: "/admin/ecommerce/billing", label: "New sale", icon: Receipt, primary: true }, { href: "/admin/ecommerce/due", label: "Collect due", icon: HandCoins }]} />
        <BillingDashboard d={d} />
      </AdminShell>
    );
  }
  if (role === "catalog_manager" || (p.ecommerce?.manage_products && !p.orders?.view)) {
    const d = await catalogData();
    return (
      <AdminShell {...shell} pageTitle="Products" pageSubtitle="Your catalogue at a glance">
        <Welcome name={name} role={role} actions={[{ href: "/admin/ecommerce/products/add", label: "Add product", icon: PackagePlus, primary: true }, { href: "/admin/ecommerce/products", label: "All products", icon: Boxes }]} />
        <CatalogDashboard d={d} />
      </AdminShell>
    );
  }
  if (role === "marketing" || p.ecommerce?.manage_homepage || p.ecommerce?.manage_coupons) {
    const d = await marketingData();
    return (
      <AdminShell {...shell} pageTitle="Marketing" pageSubtitle="Offers, campaigns and customers">
        <Welcome name={name} role={role} actions={[{ href: "/admin/customizer", label: "Store customizer", icon: LayoutTemplate, primary: true }, { href: "/admin/ecommerce/coupons", label: "Coupons", icon: BadgePercent }]} />
        <MarketingDashboard d={d} />
      </AdminShell>
    );
  }
  return null;
}
