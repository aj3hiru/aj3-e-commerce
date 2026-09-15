import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, ArrowLeft, Check } from "lucide-react";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

interface OrderPageProps {
  searchParams: Promise<{ id?: string; placed?: string }>;
}

const STATUSES = ["Pending", "In Progress", "Delivered"];

/** Verified against shop/order.php. */
export default async function OrderPage({ searchParams }: OrderPageProps) {
  const { id, placed } = await searchParams;
  const customer = await getCustomerSession();
  if (!customer) redirect(`/shop/login?redirect=${encodeURIComponent(`/shop/order?id=${id ?? 0}`)}`);

  const layoutData = await getShopLayoutData();
  const orderId = Number(id ?? 0);
  const order = await prisma.ecomOrder.findFirst({
    where: { id: orderId, customerId: customer.customerId },
    include: { items: true, customer: { select: { address: true } } },
  });
  if (!order) notFound();

  const currentStep = STATUSES.indexOf(order.orderStatus);
  const isCanceled = order.orderStatus === "Canceled";

  return (
    <ShopLayout {...layoutData}>
      <div className="max-w-2xl mx-auto">
        {placed && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
            <CheckCircle2 className="w-4 h-4" /> Your order has been placed successfully!
          </div>
        )}

        <h2 className="text-lg font-bold mb-4">Order {order.orderNumber}</h2>

        {isCanceled ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-2.5 mb-4">This order was canceled.</div>
        ) : (
          <div className="flex justify-between mb-6 text-center">
            {STATUSES.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={cn("w-9 h-9 rounded-full mx-auto mb-1.5 flex items-center justify-center text-white", i <= currentStep ? "bg-admin-primary" : "bg-storefront-border")}>
                  <Check className="w-4 h-4" />
                </div>
                <div className="text-xs">{s}</div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-lg border border-storefront-border p-5 mb-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-storefront-border">
                  <th className="py-2">Item</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">Price</th>
                  <th className="py-2">GST</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it: (typeof order.items)[number]) => (
                  <tr key={it.id} className="border-b border-storefront-border">
                    <td className="py-2">{it.productName}</td>
                    <td className="py-2">{it.qty}</td>
                    <td className="py-2">₹{Number(it.price).toFixed(2)}</td>
                    <td className="py-2">{Number(it.gstRate).toFixed(2)}%</td>
                    <td className="py-2 text-right">₹{(Number(it.price) * it.qty).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {Number(order.discountAmount) > 0 && (
                  <tr><td colSpan={4} className="text-right py-1">Discount</td><td className="text-right py-1">-₹{Number(order.discountAmount).toFixed(2)}</td></tr>
                )}
                {Number(order.gstAmount) > 0 && (
                  <tr><td colSpan={4} className="text-right py-1">GST</td><td className="text-right py-1">+₹{Number(order.gstAmount).toFixed(2)}</td></tr>
                )}
                <tr className="font-bold"><td colSpan={4} className="text-right py-2">Total</td><td className="text-right py-2">₹{Number(order.totalAmount).toFixed(2)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-storefront-border p-5">
          <p className="mb-1"><strong>Payment Status:</strong>{" "}
            <span className={cn("text-xs font-semibold rounded px-2 py-1 text-white", order.paymentStatus === "Paid" ? "bg-emerald-500" : "bg-admin-gray-400")}>
              {order.paymentStatus}
            </span>
          </p>
          <p className="mb-1"><strong>Order Date:</strong> {order.createdAt.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
          <p className="mb-0"><strong>Delivery Address:</strong> {order.customer?.address ?? "—"}</p>
        </div>

        <Link href="/shop/account#orders" className="inline-flex items-center gap-1.5 border border-storefront-green text-storefront-green-dark font-semibold rounded px-4 py-2 mt-3">
          <ArrowLeft className="w-4 h-4" /> Back to My Orders
        </Link>
      </div>
    </ShopLayout>
  );
}
