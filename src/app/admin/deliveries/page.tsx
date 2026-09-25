import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { AgentDeliveries } from "@/components/admin/deliveries/AgentDeliveries";
import { DeliveryBoard } from "@/components/admin/deliveries/DeliveryBoard";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { loadAgentDeliveries, loadDeliveryBoard } from "@/lib/deliveries";

/** /admin/deliveries — a delivery agent's own deliveries; ?view=all is the deliveries board for managers. */
export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/shop/login");
  const { view } = await searchParams;
  const isAgent = hasPermission(session.permissions, "delivery", "deliver");
  const canBoard = hasPermission(session.permissions, "delivery", "view_all");
  const board = canBoard && (view === "all" || !isAgent);
  if (!board && !isAgent) redirect("/admin/dashboard");

  const shell = { siteName: "EduMint24", username: session.username, role: session.role, permissions: session.permissions };
  if (board) {
    const data = await loadDeliveryBoard();
    return (
      <AdminShell {...shell} pageTitle="Deliveries Board" pageSubtitle="Assign orders to delivery agents and see where every delivery is">
        <DeliveryBoard agents={data.agents} unassigned={data.unassigned} canAssign={hasPermission(session.permissions, "orders", "assign_delivery")} />
      </AdminShell>
    );
  }
  const data = await loadAgentDeliveries(session.userId);
  return (
    <AdminShell {...shell} pageTitle="My Deliveries" pageSubtitle="Navigate, collect the payment, then mark delivered">
      <AgentDeliveries active={data.active} done={data.done} stats={data.stats} />
    </AdminShell>
  );
}
