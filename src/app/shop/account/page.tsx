import { redirect } from "next/navigation";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { AccountView } from "@/components/shop/pages/AccountView";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { loadCustomerOrders } from "@/lib/customer-orders";
import { listAddresses } from "@/lib/customer-addresses";
import { getAuthSettings } from "@/lib/auth-settings";
import { otpReady } from "@/types/auth-settings";
import { prettyPhone } from "@/lib/customer-phone";
import { prisma } from "@/lib/db";

interface AccountPageProps {
  searchParams: Promise<{ welcome?: string; setup?: string; next?: string }>;
}

const safeNext = (t?: string) => (t && t.startsWith("/") && !t.startsWith("//") && !t.startsWith("/\\") ? t : null);

/** My Account — see AccountView. A new OTP account without a name gets the profile setup first. */
export default async function AccountPage({ searchParams }: AccountPageProps) {
  const customer = await getCustomerSession();
  if (!customer) redirect(`/shop/login?redirect=${encodeURIComponent("/shop/account")}`);

  const { welcome, setup, next } = await searchParams;
  const [layoutData, full, orders, orderCount, wishCount, addresses, auth] = await Promise.all([
    getShopLayoutData(),
    prisma.ecomCustomer.findUnique({ where: { id: customer.customerId } }),
    loadCustomerOrders(customer.customerId, 3),
    prisma.ecomOrder.count({ where: { customerId: customer.customerId } }),
    prisma.ecomWishlist.count({ where: { customerId: customer.customerId } }),
    listAddresses(customer.customerId),
    getAuthSettings(),
  ]);
  const name = (full?.name ?? customer.name).trim();

  return (
    <ShopLayout {...layoutData}>
      <AccountView a={{
        name, email: full?.email ?? "", phone: prettyPhone(full?.phone), phoneLocked: otpReady(auth) && !!full?.phone, hasPassword: !!full?.password,
        banner: setup === "done" ? { kind: "done", store: layoutData.business.businessName } : welcome ? { kind: "welcome", store: layoutData.business.businessName } : null,
        setup: !name ? { next: safeNext(next) } : null,
        orders, orderCount, wishCount, cartCount: layoutData.cartCount, addresses,
      }} />
    </ShopLayout>
  );
}
