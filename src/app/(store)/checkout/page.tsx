import { redirect } from "next/navigation";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { CheckoutForm } from "@/components/shop/CheckoutForm";
import { Page } from "@/components/shop/ui/Meesho";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCart } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import { loadCartLines } from "@/lib/cart-lines";
import { listAddresses } from "@/lib/customer-addresses";
import { deliveryChargeFor, getDeliverySettings } from "@/lib/delivery-charge";

/** Verified against shop/checkout.php's two redirect guards (must be logged in,
 *  cart must not be empty) and the order-summary display. */
export default async function CheckoutPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect("/login?redirect=" + encodeURIComponent("/checkout"));

  // A new mobile-OTP account names itself before its first order.
  if (!customer.name.trim()) redirect(`/account?setup=1&next=${encodeURIComponent("/checkout")}`);

  const cart = await getCart();
  if (Object.keys(cart).length === 0) redirect("/cart");

  const [layoutData, customerRow, lines, paymentMethods, addresses, deliveryRule] = await Promise.all([
    getShopLayoutData(),
    prisma.ecomCustomer.findUnique({ where: { id: customer.customerId } }),
    loadCartLines(cart), // campaign and size prices
    prisma.ecomPaymentSettings.findMany({ where: { isEnabled: true }, select: { methodKey: true, name: true } }),
    listAddresses(customer.customerId),
    getDeliverySettings(),
  ]);

  let subtotal = 0;
  let estimatedGst = 0;
  const items = lines.map((l) => {
    const lineTotal = l.unitPrice * l.qty;
    subtotal += lineTotal;
    estimatedGst += lineTotal * (Number(l.product.gstRate) / 100);
    return { name: l.name, qty: l.qty, lineTotal, image: l.product.image };
  });

  return (
    <ShopLayout {...layoutData}>
      <Page title="Checkout" back="/cart">
        <CheckoutForm
          addresses={addresses}
          customerName={customerRow?.name}
          customerPhone={customerRow?.phone}
          paymentMethods={paymentMethods}
          items={items}
          subtotal={subtotal}
          estimatedGst={estimatedGst}
          delivery={{ charge: deliveryChargeFor(subtotal, deliveryRule), freeAbove: deliveryRule.freeAbove, enabled: deliveryRule.enabled, note: deliveryRule.note }}
        />
      </Page>
    </ShopLayout>
  );
}
