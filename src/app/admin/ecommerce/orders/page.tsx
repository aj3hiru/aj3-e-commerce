import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface OrdersPageProps {
  searchParams: Promise<{ type?: string; success?: string }>;
}

const VALID_ORDER_STATUSES = ["Pending", "In Progress", "Delivered", "Canceled"];

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

  const [orders, totalAll, totalPending, totalProgress, totalDelivered, totalCanceled] = await Promise.all([
    prisma.ecomOrder.findMany({
      where: { orderType: "online", ...(type ? { orderStatus: type } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { address: true } },
        items: { select: { qty: true, productName: true } },
      },
    }),
    prisma.ecomOrder.count({ where: { orderType: "online" } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "Pending" } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "In Progress" } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "Delivered" } }),
    prisma.ecomOrder.count({ where: { orderType: "online", orderStatus: "Canceled" } }),
  ]);

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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Link href="/admin/ecommerce/orders" className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-admin-gray-900">{totalAll.toLocaleString("en-IN")}</div>
          <div className="text-xs text-admin-gray-500 mt-1">All Orders</div>
        </Link>
        <Link href="/admin/ecommerce/orders?type=Pending" className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-amber-600">{totalPending.toLocaleString("en-IN")}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Pending</div>
        </Link>
        <Link href="/admin/ecommerce/orders?type=In+Progress" className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-sky-600">{totalProgress.toLocaleString("en-IN")}</div>
          <div className="text-xs text-admin-gray-500 mt-1">In Progress</div>
        </Link>
        <Link href="/admin/ecommerce/orders?type=Delivered" className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-emerald-600">{totalDelivered.toLocaleString("en-IN")}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Delivered</div>
        </Link>
        <Link href="/admin/ecommerce/orders?type=Canceled" className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
          <div className="text-xl font-bold text-red-600">{totalCanceled.toLocaleString("en-IN")}</div>
          <div className="text-xs text-admin-gray-500 mt-1">Canceled</div>
        </Link>
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
