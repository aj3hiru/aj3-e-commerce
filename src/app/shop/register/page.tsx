import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { RegisterForm } from "@/components/shop/RegisterForm";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { prisma } from "@/lib/db";

/** Verified against shop/register.php — already-logged-in customer redirects to /shop/account. */
export default async function RegisterPage() {
  const customerSession = await getCustomerSession();
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
      <RegisterForm />
    </ShopLayout>
  );
}
