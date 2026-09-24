import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { getCustomerSession } from "@/lib/customer-auth";
import { LoginForm } from "@/components/shop/LoginForm";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { getShopLayoutData } from "@/lib/shop-layout-data";

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string }>;
}

/**
 * Verified against shop/login.php:
 * - Already-logged-in admin/editor/author -> redirect to /admin/dashboard
 * - Already-logged-in customer -> redirect to /shop/account
 * - Otherwise render the unified login form inside the normal shop layout
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [adminSession, customerSession, resolvedParams] = await Promise.all([
    getAdminSession(),
    getCustomerSession(),
    searchParams,
  ]);

  if (adminSession) redirect("/admin/dashboard");
  if (customerSession) redirect("/shop/account");

  // Same header/footer/menus as every other storefront page (visitor is logged out here).
  const layout = await getShopLayoutData();

  return (
    <ShopLayout {...layout}>
      <LoginForm redirectTo={resolvedParams.redirect} />
    </ShopLayout>
  );
}
