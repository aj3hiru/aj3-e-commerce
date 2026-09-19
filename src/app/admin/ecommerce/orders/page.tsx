import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { ORDER_STATUSES } from "@/lib/order-statuses";
import { formatInt } from "@/lib/format";

interface OrdersPageProps {
  searchParams: Promise<{ type?: string; success?: string }>;
}

const VALID_ORDER_STATUSES: readonly string[] = ORDER_STATUSES;

/** The per-status figure colours from the `.stat-mini .val` inline styles in
 *  orders.php — the admin CSS variables, not Tailwind's near-miss equivalents.
 *  "Out for Delivery" reuses --info, matching its pill colour. */
const STAT_MINI_COLORS: Record<string, string> = {
  Pending: "#f59e0b",            // var(--warning)
  "In Progress": "#3b82f6",      // var(--info)
  "Out for Delivery": "#3b82f6", // var(--info)
  Delivered: "#10b981",          // var(--success)
  Canceled: "#ef4444",           // var(--danger)
};

/** Verified against admin/ecommerce/orders.php — only order_type='online' orders
 *  are shown here (offline/POS sales live in sales-history.php). */
export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_orders")) {
    redirect("/shop/login");
  }

  const params = await searchParams;
  const type = params.type && VALID_ORDER_STATUSES.includes(params.type) ? params.type : "";
  const heading = type ? `${type} Orders` : "All Orders";

  // One count per status, derived from ORDER_STATUSES so a newly added status
  // can never end up with a reachable ?type= filter but no tile and no count
  // (which is exactly what happened when "Out for Delivery" was introduced).
  const [orders, totalAll, ...statusCounts] = await Promise.all([
    prisma.ecomOrder.findMany({
      where: { orderType: "online", ...(type ? { orderStatus: type } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { address: true } },
        items: { select: { qty: true, productName: true } },
      },
    }),
    prisma.ecomOrder.count({ where: { orderType: "online" } }),
    ...ORDER_STATUSES.map((st) =>
      prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: st } })
    ),
  ]);

  const tiles = ORDER_STATUSES.map((st, i) => ({
    status: st as string,
    count: statusCounts[i] as number,
    // `.stat-mini .val` colours, verbatim from the inline styles in orders.php:
    // var(--warning) / var(--info) / var(--success) / var(--danger).
    color: STAT_MINI_COLORS[st] ?? "var(--admin-gray-900)",
  }));

  const canBill = hasPermission(session.permissions, "ecommerce", "manage_billing");

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle={heading}
      pageSubtitle="Track and manage customer orders"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success === "deleted" && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          Order deleted successfully!
        </div>
      )}

      {/*
        .stat-mini-grid — a horizontally scrollable flex row, NOT a grid:
          .stat-mini-grid { display:flex; gap:.75rem; overflow-x:auto;
                            padding-bottom:.25rem; margin-bottom:1rem }
          .stat-mini      { flex:0 0 auto; #fff; radius .75rem; padding:1rem 1.25rem;
                            min-width:150px; shadow 0 1px 3px 0 rgb(0 0 0/.1);
                            border 1px solid var(--gray-100) }
          .stat-mini .val { 1.375rem / 700 / var(--gray-900) }
          .stat-mini .lbl { .75rem / var(--gray-500) / margin-top .15rem }
      */}
      <div className="mb-4 flex gap-3 overflow-x-auto pb-1">
        <Link href="/admin/ecommerce/orders" className="no-underline">
          <div className="min-w-[150px] flex-none rounded-[0.75rem] border border-admin-gray-100 bg-white px-5 py-4 shadow-[0_1px_3px_0_rgb(0_0_0_/_0.1)]">
            <div className="text-[1.375rem] font-bold text-admin-gray-900">{formatInt(totalAll)}</div>
            <div className="mt-[0.15rem] text-[0.75rem] text-admin-gray-500">All Orders</div>
          </div>
        </Link>
        {tiles.map((t) => (
          <Link key={t.status} href={`/admin/ecommerce/orders?type=${encodeURIComponent(t.status)}`} className="no-underline">
            <div className="min-w-[150px] flex-none rounded-[0.75rem] border border-admin-gray-100 bg-white px-5 py-4 shadow-[0_1px_3px_0_rgb(0_0_0_/_0.1)]">
              <div className="text-[1.375rem] font-bold" style={{ color: t.color }}>{formatInt(t.count)}</div>
              <div className="mt-[0.15rem] text-[0.75rem] text-admin-gray-500">{t.status}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">{heading}</h3>
        {canBill && (
          <Link href="/admin/ecommerce/billing" className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-3.5 py-2">
            <Plus className="w-4 h-4" /> Create Order
          </Link>
        )}
      </div>

      <OrdersTable
        currentType={type}
        orders={orders.map((o: (typeof orders)[number]) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          customerLabel: o.customerName || o.customerEmail || "—",
          itemsSummary: o.items.length ? o.items.map((it: (typeof o.items)[number]) => `${it.qty}x ${it.productName}`).join(", ") : "—",
          addressLabel: o.shippingAddress || o.customer?.address || "—",
          totalAmount: Number(o.totalAmount),
          paymentStatus: o.paymentStatus,
          orderStatus: o.orderStatus,
        }))}
      />
    </AdminShell>
  );
}
