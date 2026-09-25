import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { OrderDetailView } from "@/components/admin/OrderDetailView";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { isOrderLocked } from "@/lib/order-recalc";
import { prisma } from "@/lib/db";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

/** Verified against admin/ecommerce/order-view.php. */
export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_orders")) {
    redirect("/shop/login");
  }

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  const order = await prisma.ecomOrder.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: { select: { phone: true, email: true, address: true } },
      credits: { include: { payments: true }, take: 1 },
    },
  });
  if (!order) notFound();

  const locked = isOrderLocked(order.orderStatus);
  const linkedCredit = order.credits[0] ?? null;
  const dueBalance = linkedCredit ? Math.max(0, Number(linkedCredit.amount) - Number(linkedCredit.amountPaid)) : 0;

  const availableProducts = locked
    ? []
    : await prisma.ecomProduct.findMany({
        where: { status: "active" },
        select: { id: true, name: true, sku: true, price: true },
        orderBy: { name: "asc" },
      });

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle={`Order ${order.orderNumber}`}
      pageSubtitle="Order details and items"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <OrderDetailView
        order={{
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: order.customer?.phone ?? null,
          customerEmail: order.customerEmail || order.customer?.email || null,
          shippingAddress: order.shippingAddress || order.customer?.address || null,
          mapUrl: order.shippingLat !== null && order.shippingLng !== null ? `https://www.google.com/maps?q=${Number(order.shippingLat)},${Number(order.shippingLng)}` : null,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
          totalAmount: Number(order.totalAmount),
          locked,
          dueBalance,
          duePaymentCount: linkedCredit?.payments.length ?? 0,
          linkedCreditId: linkedCredit?.id ?? null,
        }}
        items={order.items.map((it: (typeof order.items)[number]) => ({
          id: it.id,
          productName: it.productName,
          qty: it.qty,
          price: Number(it.price),
        }))}
        availableProducts={availableProducts.map((p: (typeof availableProducts)[number]) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          price: Number(p.price),
        }))}
      />
    </AdminShell>
  );
}
