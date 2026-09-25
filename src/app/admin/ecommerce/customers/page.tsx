import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Customers2Body, Customers2HeaderButtons } from "@/components/admin/customers2/Customers2Body";
import { CUSTOMERS2_GROUPS, CUSTOMERS2_PREF_KEY, CUSTOMERS2_STANDALONE } from "@/components/admin/customers2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getCustomers2Data, parseCustomerRange } from "@/lib/customers2";

/**
 * /admin/ecommerce/customers — a redesign of the Customers page, kept
 * alongside /admin/ecommerce/customers (same idea as products2 / brands2).
 * Same access rule (manage_customers). No database change needed.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/customers/  src/components/admin/customers2/
 *   src/app/api/ecommerce/customers2/    src/lib/customers2.ts  src/lib/customer2-save.ts
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Customers2Page({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_customers")) {
    redirect("/staff/login");
  }

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = parseCustomerRange({ from: first(sp.from), to: first(sp.to) });
  const data = await getCustomers2Data(range);

  return (
    <DashboardWidgetPrefsProvider prefKey={CUSTOMERS2_PREF_KEY} groups={CUSTOMERS2_GROUPS} standalone={CUSTOMERS2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Customers"
        pageSubtitle="Everyone who buys from the shop and the counter, with what they've spent and owe"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <Customers2HeaderButtons />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <Customers2HeaderButtons />
        </div>
        <Customers2Body data={data} range={range} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
