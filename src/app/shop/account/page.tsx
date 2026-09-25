import { redirect } from "next/navigation";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { AccountView } from "@/components/shop/pages/AccountView";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { loadCustomerOrders } from "@/lib/customer-orders";
import { prisma } from "@/lib/db";

interface AccountPageProps {
  searchParams: Promise<{ welcome?: string }>;
}

/** My Account — see AccountView. */
export default async function AccountPage({ searchParams }: AccountPageProps) {
  const customer = await getCustomerSession();
  if (!customer) redirect(`/shop/login?redirect=${encodeURIComponent("/shop/account")}`);

  const { welcome } = await searchParams;
  const [layoutData, full, orders, orderCount, wishCount] = await Promise.all([
    getShopLayoutData(),
    prisma.ecomCustomer.findUnique({ where: { id: customer.customerId } }),
    loadCustomerOrders(customer.customerId, 3),
    prisma.ecomOrder.count({ where: { customerId: customer.customerId } }),
    prisma.ecomWishlist.count({ where: { customerId: customer.customerId } }),
  ]);

  return (
    <ShopLayout {...layoutData}>
      <AccountView a={{
        name: full?.name ?? customer.name, email: full?.email ?? "", phone: full?.phone ?? "", address: full?.address ?? "",
        welcomeStore: welcome ? layoutData.business.businessName : null, orders, orderCount, wishCount, cartCount: layoutData.cartCount,
      }} />
    </ShopLayout>
  );
}
