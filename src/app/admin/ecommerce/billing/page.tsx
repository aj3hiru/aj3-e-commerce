import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PosBillingScreen } from "@/components/admin/PosBillingScreen";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface BillingPageProps {
  searchParams: Promise<{ customer_id?: string }>;
}

/**
 * Verified against the top of admin/ecommerce/billing.php:
 * - Access denied if not logged in / inactive / missing 'ecommerce.manage_billing'
 * - Preloads active products, active coupons, active customers
 * - Supports ?customer_id=42 to preselect a customer (e.g. arriving from their profile)
 */
export default async function BillingPage({ searchParams }: BillingPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_billing")) {
    redirect("/admin/admin-login-portal");
  }

  const resolvedSearchParams = await searchParams;

  const [products, coupons, customers, business] = await Promise.all([
    prisma.ecomProduct.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, sku: true, barcode: true, price: true, salePrice: true,
        gstRate: true, stockQty: true, productType: true, categoryId: true, subcategoryId: true,
      },
    }),
    prisma.ecomCoupon.findMany({
      where: { status: "active" },
      select: { code: true, discountType: true, discountValue: true, appliesTo: true, productId: true, categoryId: true, subcategoryId: true },
    }),
    prisma.ecomCustomer.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } }),
  ]);

  let preselectedCustomer = null;
  const customerIdParam = resolvedSearchParams.customer_id;
  if (customerIdParam && /^\d+$/.test(customerIdParam)) {
    preselectedCustomer = await prisma.ecomCustomer.findUnique({
      where: { id: Number(customerIdParam) },
      select: { id: true, name: true, phone: true },
    });
  }

  const pageTitle = preselectedCustomer ? `New Order — ${preselectedCustomer.name}` : "Billing / POS";
  const pageSubtitle = preselectedCustomer
    ? "Add products and complete the order for this customer"
    : "Scan a barcode or search a product to start a sale";

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle={pageTitle}
      pageSubtitle={pageSubtitle}
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <PosBillingScreen
        // NOTE: `p`/`c` show as implicit-any here ONLY because this sandbox
        // could not download the Prisma query engine (network restricted) to
        // run `prisma generate`. In your real environment, run `npx prisma
        // generate` after setting DATABASE_URL and these will be fully typed
        // from schema.prisma automatically — no code change needed.
        allProducts={products.map((p: (typeof products)[number]) => ({
          id: p.id, name: p.name, sku: p.sku, barcode: p.barcode,
          price: Number(p.price), salePrice: p.salePrice ? Number(p.salePrice) : null,
          gstRate: Number(p.gstRate), stockQty: p.stockQty, productType: p.productType,
          categoryId: p.categoryId, subcategoryId: p.subcategoryId,
        }))}
        allCoupons={coupons.map((c: (typeof coupons)[number]) => ({
          code: c.code, discountType: c.discountType as "percentage" | "fixed",
          discountValue: Number(c.discountValue), appliesTo: c.appliesTo as "all" | "product" | "category" | "subcategory",
          productId: c.productId, categoryId: c.categoryId, subcategoryId: c.subcategoryId,
        }))}
        allCustomers={customers}
        posSettings={{
          posPrintMode: (business?.posPrintMode as "both" | "thermal" | "a4") ?? "both",
          printerFormat: (business?.printerFormat as "thermal_58" | "thermal_80") ?? "thermal_80",
          shortcutCompleteSale: business?.shortcutCompleteSale ?? "F2",
          shortcutPrint: business?.shortcutPrint ?? "F3",
          shortcutNewSale: business?.shortcutNewSale ?? "F4",
        }}
        preselectedCustomer={preselectedCustomer}
      />
    </AdminShell>
  );
}
