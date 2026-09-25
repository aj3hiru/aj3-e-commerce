import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { RegisterForm } from "@/components/shop/RegisterForm";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { getShopLayoutData } from "@/lib/shop-layout-data";

/** Verified against shop/register.php — already-logged-in customer redirects to /shop/account. */
export default async function RegisterPage() {
  const customerSession = await getCustomerSession();
  if (customerSession) redirect("/shop/account");

  // Same header/footer/menus as every other storefront page (visitor is logged out here).
  const layout = await getShopLayoutData();

  return (
    <ShopLayout {...layout}>
      <RegisterForm storeName={layout.business.businessName} />
    </ShopLayout>
  );
}
