import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DeliveryBoard } from "@/components/admin/deliveries/DeliveryBoard";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { loadDeliveryBoard } from "@/lib/deliveries";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { DELIVERIES_GROUPS, DELIVERIES_PREF_KEY, DELIVERIES_STANDALONE } from "@/components/admin/deliveries/displayOptions";

/** /admin/deliveries — a delivery agent's own deliveries; ?view=all is the deliveries board for managers. */
export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  const { view } = await searchParams;
  const isAgent = hasPermission(session.permissions, "delivery", "deliver");
  const canBoard = hasPermission(session.permissions, "delivery", "view_all");
  const board = canBoard && (view === "all" || !isAgent);
  if (!board && !isAgent) redirect("/admin/dashboard");

  const shell = { siteName: "EduMint24", username: session.username, role: session.role, permissions: session.permissions };
  if (board) {
    const data = await loadDeliveryBoard();
    return (
      <DashboardWidgetPrefsProvider prefKey={DELIVERIES_PREF_KEY} groups={DELIVERIES_GROUPS} standalone={DELIVERIES_STANDALONE}>
        <AdminShell {...shell} pageTitle="Deliveries Board" pageSubtitle="Assign orders to delivery agents and see where every delivery is"
          headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}>
          <div className="mb-4 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
          <DeliveryBoard agents={data.agents} unassigned={data.unassigned} canAssign={hasPermission(session.permissions, "orders", "assign_delivery")} />
        </AdminShell>
      </DashboardWidgetPrefsProvider>
    );
  }
  redirect("/agent"); // delivery agents use their own app
}
