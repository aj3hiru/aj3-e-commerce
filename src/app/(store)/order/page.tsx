import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { Empty, Page, btnPrimary } from "@/components/shop/ui/Meesho";
import { OrderDetailView } from "@/components/shop/pages/OrderDetail";
import { OrderCard } from "@/components/shop/pages/Orders";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { loadCustomerOrders } from "@/lib/customer-orders";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

interface OrderPageProps {
  searchParams: Promise<{ id?: string; placed?: string }>;
}

/**
 * /shop/order — without an id: all the customer's orders ("Track Order");
 * with ?id=: that order's tracking timeline, items, prices and address.
 */
export default async function OrderPage({ searchParams }: OrderPageProps) {
  const { id, placed } = await searchParams;
  const customer = await getCustomerSession();
  const here = id ? `/order?id=${id}` : "/order";
  if (!customer) redirect(`/login?redirect=${encodeURIComponent(here)}`);
  const layoutData = await getShopLayoutData();

  // ── All orders ─────────────────────────────────────────────────────────────
  if (!id) {
    const orders = await loadCustomerOrders(customer.customerId);
    return (
      <ShopLayout {...layoutData}>
        <Page title="My Orders" back="/account">
          {orders.length === 0
            ? <Empty icon={PackageSearch} title="No orders yet" text="When you place an order, you can track it here."
                action={<Link href="/" className={cn(btnPrimary, "w-56")}>Start Shopping</Link>} />
            : orders.map((o) => <OrderCard key={o.id} o={o} />)}
        </Page>
      </ShopLayout>
    );
  }

  // ── One order ──────────────────────────────────────────────────────────────
  const order = await prisma.ecomOrder.findFirst({
    where: { id: Number(id) || 0, customerId: customer.customerId },
    include: {
      items: true, customer: { select: { address: true, phone: true } }, deliveryAgent: { select: { username: true } },
      events: { where: { type: "status" }, orderBy: { createdAt: "asc" }, select: { toValue: true, createdAt: true } },
    },
  });
  if (!order) notFound();
  const [products, payment] = await Promise.all([
    prisma.ecomProduct.findMany({ where: { id: { in: order.items.map((i) => i.productId) } }, select: { id: true, slug: true, image: true } }),
    prisma.ecomPaymentSettings.findFirst({ where: { methodKey: order.paymentMethod }, select: { name: true } }),
  ]);
  const prod = new Map(products.map((p) => [p.id, p]));

  return (
    <ShopLayout {...layoutData}>
      <OrderDetailView o={{
        number: order.orderNumber, createdAt: order.createdAt.toISOString(), status: order.orderStatus, placed: !!placed,
        storeName: layoutData.business.businessName, helpPhone: layoutData.business.contactNumbers?.find(Boolean) ?? null,
        items: order.items.map((it) => { const p = prod.get(it.productId); return { id: it.id, name: it.productName, qty: it.qty, price: Number(it.price), slug: p?.slug ?? null, image: p?.image ?? null }; }),
        discount: Number(order.discountAmount), gst: Number(order.gstAmount), total: Number(order.totalAmount),
        paymentName: payment?.name ?? order.paymentMethod, paymentStatus: order.paymentStatus,
        customerName: order.customerName, customerPhone: order.customer?.phone ?? null, address: order.shippingAddress || order.customer?.address || "",
        stepTimes: Object.fromEntries(order.events.filter((e) => e.toValue).map((e) => [e.toValue!, e.createdAt.toISOString()])),
        agentName: order.deliveryAgent ? order.deliveryAgent.username.split(/[\s._-]/)[0] : null,
        cancelReason: order.cancelReason,
      }} />
    </ShopLayout>
  );
}
