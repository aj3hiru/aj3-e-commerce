import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { OrderDetailView } from "@/components/admin/OrderDetailView";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { isOrderLocked } from "@/lib/order-recalc";
import { prisma } from "@/lib/db";
import { listDeliveryAgents } from "@/lib/order-workflow";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { ORDERVIEW_GROUPS, ORDERVIEW_PREF_KEY, ORDERVIEW_STANDALONE } from "@/components/admin/order-view/displayOptions";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

/** Verified against admin/ecommerce/order-view.php. */
export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (!hasPermission(session.permissions, "orders", "view")) redirect("/admin/dashboard?denied=1");

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  const order = await prisma.ecomOrder.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { image: true, slug: true } } } },
      customer: { select: { phone: true, email: true, address: true } },
      deliveryAgent: { select: { id: true, username: true } },
      events: { orderBy: { createdAt: "asc" } },
      credits: { include: { payments: true }, take: 1 },
    },
  });
  if (!order) notFound();

  const locked = isOrderLocked(order.orderStatus);
  const linkedCredit = order.credits[0] ?? null;
  const dueBalance = linkedCredit ? Math.max(0, Number(linkedCredit.amount) - Number(linkedCredit.amountPaid)) : 0;

  const perms = session.permissions.orders ?? {};
  const agents = order.orderType === "online" ? await listDeliveryAgents() : [];
  const availableProducts = locked || !perms.edit_items
    ? []
    : await prisma.ecomProduct.findMany({
        where: { status: "active" },
        select: { id: true, name: true, sku: true, price: true },
        orderBy: { name: "asc" },
      });

  return (
    <DashboardWidgetPrefsProvider prefKey={ORDERVIEW_PREF_KEY} groups={ORDERVIEW_GROUPS} standalone={ORDERVIEW_STANDALONE}>
    <AdminShell
      siteName="EduMint24"
      pageTitle={`Order ${order.orderNumber}`}
      pageSubtitle={order.orderType === "offline" ? "Store bill — items, payment and history" : "Online order — items, delivery, payment and history"}
      username={session.username}
      role={session.role}
      permissions={session.permissions}
      headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}
    >
      <div className="mb-4 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
      <OrderDetailView
        order={{
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: order.customer?.phone ?? null,
          customerEmail: order.customerEmail || order.customer?.email || null,
          shippingAddress: order.shippingAddress || order.customer?.address || null,
          mapUrl: order.shippingLat !== null && order.shippingLng !== null ? `https://www.google.com/maps?q=${Number(order.shippingLat)},${Number(order.shippingLng)}` : null,
          paymentMethod: (await prisma.ecomPaymentSettings.findFirst({ where: { methodKey: order.paymentMethod }, select: { name: true } }))?.name ?? order.paymentMethod,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
          totalAmount: Number(order.totalAmount),
          locked,
          dueBalance,
          duePaymentCount: linkedCredit?.payments.length ?? 0,
          linkedCreditId: linkedCredit?.id ?? null,
          orderType: order.orderType,
          agent: order.deliveryAgent ? { id: order.deliveryAgent.id, name: order.deliveryAgent.username, assignedAt: order.assignedAt?.toISOString() ?? null } : null,
          cancelReason: order.cancelReason,
          customerId: order.customerId,
          createdAt: order.createdAt.toISOString(),
          subtotal: Number(order.subtotalAmount),
          discount: Number(order.discountAmount),
          gst: Number(order.gstAmount),
          paidAmount: Number(order.paidAmount),
          lat: order.shippingLat === null ? null : Number(order.shippingLat),
          lng: order.shippingLng === null ? null : Number(order.shippingLng),
        }}
        perms={{ accept: !!perms.accept_reject, status: !!perms.update_status, assign: !!perms.assign_delivery, pay: !!perms.mark_paid, cancel: !!perms.cancel, editItems: !!perms.edit_items }}
        agents={agents}
        events={order.events.map((e) => ({ id: e.id, type: e.type, from: e.fromValue, to: e.toValue, note: e.note, actor: e.actorName, at: e.createdAt.toISOString() }))}
        items={order.items.map((it: (typeof order.items)[number]) => ({
          id: it.id,
          productName: it.productName,
          qty: it.qty,
          price: Number(it.price),
          gstRate: Number(it.gstRate),
          image: it.product?.image ?? null,
          slug: it.product?.slug ?? null,
        }))}
        availableProducts={availableProducts.map((p: (typeof availableProducts)[number]) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          price: Number(p.price),
        }))}
      />
    </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
