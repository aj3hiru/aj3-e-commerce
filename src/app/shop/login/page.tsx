import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { getCustomerSession } from "@/lib/customer-auth";
import { LoginForm } from "@/components/shop/LoginForm";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { prisma } from "@/lib/db";

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

  const business = await prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } });
  const categories = await prisma.ecomCategory.findMany({ where: { status: "active" }, orderBy: { serial: "asc" } });

  return (
    <ShopLayout
      business={{
        businessName: business?.businessName ?? "EduMint24",
        logo: business?.logo,
        contactNumbers: (business?.contactNumbers as string[]) ?? [],
      }}
      categories={categories.map((c: (typeof categories)[number]) => ({ slug: c.slug, name: c.name }))}
      customer={null}
      cartCount={0}
      cartTotal={0}
    >
      <LoginForm redirectTo={resolvedParams.redirect} />
    </ShopLayout>
  );
}
