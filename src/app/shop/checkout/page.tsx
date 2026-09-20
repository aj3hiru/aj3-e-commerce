import { redirect } from "next/navigation";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { CheckoutForm } from "@/components/shop/CheckoutForm";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCart } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import { effectivePrice } from "@/lib/shop-price";
import { campaignSalePrices } from "@/lib/campaign-pricing";

/** Verified against shop/checkout.php's two redirect guards (must be logged in,
 *  cart must not be empty) and the order-summary display. */
export default async function CheckoutPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/shop/login?redirect=" + encodeURIComponent("/shop/checkout"));

  const cart = await getCart();
  if (Object.keys(cart).length === 0) redirect("/shop/cart");

  const [layoutData, customerRow, products, paymentMethods] = await Promise.all([
    getShopLayoutData(),
    prisma.ecomCustomer.findUnique({ where: { id: customer.customerId } }),
    prisma.ecomProduct.findMany({ where: { id: { in: Object.keys(cart).map(Number) } } }),
    prisma.ecomPaymentSettings.findMany({ where: { isEnabled: true }, select: { methodKey: true, name: true } }),
  ]);

  const campaign = await campaignSalePrices(products); // campaign prices, when a campaign is live

  let subtotal = 0;
  let estimatedGst = 0;
  const items = products.map((p: (typeof products)[number]) => {
    const qty = cart[p.id] ?? 0;
    const unit = campaign.get(p.id) ?? effectivePrice(Number(p.price), p.salePrice ? Number(p.salePrice) : null);
    const lineTotal = unit * qty;
    subtotal += lineTotal;
    estimatedGst += lineTotal * (Number(p.gstRate) / 100);
    return { name: p.name, qty, lineTotal };
  });

  return (
    <ShopLayout {...layoutData}>
      <h2 className="text-lg font-bold mb-4">Checkout</h2>
      <CheckoutForm
        initialAddress={customerRow?.address ?? ""}
        paymentMethods={paymentMethods}
        items={items}
        subtotal={subtotal}
        estimatedGst={estimatedGst}
      />
    </ShopLayout>
  );
}
