import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Due2Body, Due2HeaderButtons } from "@/components/admin/due2/Due2Body";
import { DUE2_GROUPS, DUE2_PREF_KEY, DUE2_STANDALONE } from "@/components/admin/due2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getDue2Data, parseDueRange } from "@/lib/due2";

/**
 * /admin/ecommerce/due — a redesign of the Due page, kept alongside
 * /admin/ecommerce/due so the two can be compared (same idea as products2 /
 * brands2 / sales-history2). Same access rule as the old page.
 *
 * Needs no database change: it reads the same ecom_credits and
 * ecom_credit_payments, and records payments through the same APIs, so the
 * numbers match the old page and the dashboard.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/due/  src/components/admin/due2/  src/lib/due2.ts
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Due2Page({ searchParams }: PageProps) {
  const session = await getAdminSession();
  const canView =
    !!session &&
    (hasPermission(session.permissions, "ecommerce", "manage_credits") ||
      hasPermission(session.permissions, "ecommerce", "manage_billing"));
  if (!session || !canView) redirect("/shop/login");

  // Recording a payment needs the same permission the payment API itself checks.
  const canEdit =
    hasPermission(session.permissions, "ecommerce", "manage_credits") ||
    hasPermission(session.permissions, "ecommerce", "manage_billing") ||
    hasPermission(session.permissions, "ecommerce", "manage_customers");

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = parseDueRange({ from: first(sp.from), to: first(sp.to) });
  const data = await getDue2Data(range);

  return (
    <DashboardWidgetPrefsProvider prefKey={DUE2_PREF_KEY} groups={DUE2_GROUPS} standalone={DUE2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Due"
        pageSubtitle="Who owes what, when they promised to pay, and what has been collected"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <Due2HeaderButtons />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <Due2HeaderButtons />
        </div>
        <Due2Body data={data} filters={range} canEdit={canEdit} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
