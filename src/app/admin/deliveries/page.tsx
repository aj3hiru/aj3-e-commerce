import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, History, Radio } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { DeliveryBoard } from "@/components/admin/deliveries/DeliveryBoard";
import { DeliveryHistoryView } from "@/components/admin/deliveries/DeliveryHistoryView";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { loadDeliveryBoard } from "@/lib/deliveries";
import { loadDeliveryHistory, parseDeliveryFilters } from "@/lib/delivery-history";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { DELIVERIES_GROUPS, DELIVERIES_PREF_KEY, DELIVERIES_STANDALONE } from "@/components/admin/deliveries/displayOptions";
import { cn } from "@/lib/utils";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const since = (iso: string | null) => {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** /admin/deliveries — a delivery agent's own deliveries; ?view=all is the deliveries board for managers (Live · History · Report). */
export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  const sp = await searchParams;
  const isAgent = hasPermission(session.permissions, "delivery", "deliver");
  const canBoard = hasPermission(session.permissions, "delivery", "view_all");
  const board = canBoard && (sp.view === "all" || !isAgent);
  if (!board && !isAgent) redirect("/admin/dashboard");
  if (!board) redirect("/agent"); // delivery agents use their own app

  const tab = sp.tab === "history" || sp.tab === "report" ? sp.tab : "live";
  const shell = { siteName: "EduMint24", username: session.username, role: session.role, permissions: session.permissions };
  const tabs = [
    { key: "live", label: "Live now", icon: Radio },
    { key: "history", label: "History", icon: History },
    { key: "report", label: "Agent report", icon: BarChart3 },
  ] as const;

  const nav = (
    <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl border border-admin-gray-200 bg-white p-1 shadow-sm">
      {tabs.map((t) => (
        <Link key={t.key} href={`/admin/deliveries?view=all${t.key === "live" ? "" : `&tab=${t.key}`}`} aria-current={tab === t.key ? "page" : undefined}
          className={cn("flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none", tab === t.key ? "bg-admin-primary text-white shadow-sm" : "text-admin-gray-600 hover:bg-admin-gray-50")}>
          <t.icon className="h-4 w-4" />{t.label}
        </Link>
      ))}
    </div>
  );

  if (tab !== "live") {
    const data = await loadDeliveryHistory(parseDeliveryFilters(sp));
    return (
      <AdminShell {...shell} pageTitle="Deliveries Board" pageSubtitle={tab === "report" ? "How many deliveries each agent made — today, this week, this month or any dates" : "Every delivery: delivered, failed attempts and cancelled"}>
        {nav}
        <DeliveryHistoryView tab={tab} filters={data.filters} agents={data.agents} rows={data.rows} report={data.report} totals={data.totals} />
      </AdminShell>
    );
  }

  const data = await loadDeliveryBoard();
  const onRoad = data.agents.flatMap((a) => a.orders.map((o) => ({ ...o, agentName: a.name })));
  return (
    <DashboardWidgetPrefsProvider prefKey={DELIVERIES_PREF_KEY} groups={DELIVERIES_GROUPS} standalone={DELIVERIES_STANDALONE}>
      <AdminShell {...shell} pageTitle="Deliveries Board" pageSubtitle="Who is carrying which order right now — assign new ones, follow every delivery"
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}>
        {nav}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["On the road", String(onRoad.filter((o) => o.status === "Out for Delivery").length), "bg-sky-50 text-sky-700"],
            ["Waiting for an agent", String(data.unassigned.length), "bg-amber-50 text-amber-700"],
            ["Delivered today", String(data.agents.reduce((n, a) => n + a.deliveredToday, 0)), "bg-emerald-50 text-emerald-700"],
            ["Cash to collect", money(onRoad.filter((o) => o.paymentStatus !== "Paid").reduce((n, o) => n + o.total, 0)), "bg-violet-50 text-violet-700"],
          ].map(([l, v, c]) => (
            <div key={l} className="rounded-xl border border-admin-gray-200 bg-white p-3.5 shadow-sm">
              <p className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-semibold", c)}>{l}</p>
              <p className="mt-1.5 text-xl font-bold text-admin-gray-900">{v}</p>
            </div>
          ))}
        </div>
        {onRoad.length > 0 && (
          <section className="mb-4 overflow-x-auto rounded-xl border border-admin-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-admin-gray-100 px-4 py-3 text-[15px] font-semibold text-admin-gray-900">On the road now</h2>
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-admin-gray-50 text-left text-xs uppercase tracking-wide text-admin-gray-500">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold"><th>Order</th><th>Delivery agent</th><th>Customer</th><th>Status</th><th>With the agent for</th><th className="text-right">To collect</th></tr>
              </thead>
              <tbody className="divide-y divide-admin-gray-100">
                {onRoad.map((o) => (
                  <tr key={o.id} className="[&>td]:px-3 [&>td]:py-2">
                    <td><Link href={`/admin/ecommerce/orders/${o.id}`} className="font-semibold text-[#2563eb] hover:underline">{o.number}</Link></td>
                    <td className="font-semibold text-admin-gray-900">{o.agentName}</td>
                    <td><div>{o.customer}</div><div className="max-w-[280px] truncate text-xs text-admin-gray-500" title={o.address}>{o.address.replace(/\n/g, ", ")}</div></td>
                    <td><span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", o.status === "Out for Delivery" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700")}>{o.status === "Out for Delivery" ? "On the way" : "Not picked up"}</span></td>
                    <td className="text-xs text-admin-gray-600">{since(o.assignedAt)}</td>
                    <td className="text-right font-semibold">{o.paymentStatus === "Paid" ? <span className="text-emerald-600">Paid</span> : money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <div className="mb-4 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
        <DeliveryBoard agents={data.agents} unassigned={data.unassigned} canAssign={hasPermission(session.permissions, "orders", "assign_delivery")} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
