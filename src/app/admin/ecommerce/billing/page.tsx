import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { Billing2Screen } from "@/components/admin/billing2/Billing2Screen";
import { BILLING2_GROUPS, BILLING2_PREF_KEY, BILLING2_STANDALONE } from "@/components/admin/billing2/displayOptions";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { GlobalSearchBar } from "@/components/admin/GlobalSearchBar";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { campaignSalePrices } from "@/lib/campaign-pricing";

interface Billing2PageProps {
  searchParams: Promise<{ customer_id?: string }>;
}

/**
 * /admin/ecommerce/billing2 — a trial redesign of the Billing / POS screen,
 * matching a new mockup (step chips, a right-hand "Payment Summary" card,
 * per-line unit, and a quick-add for a product not yet in the catalog).
 *
 * Kept alongside the original /admin/ecommerce/billing so the two can be
 * compared before choosing one, the same way /admin/dashboard was. Same
 * session gate, same header/sidebar (via AdminShell) and the same checkout
 * API as the original — only the on-page layout and a couple of extra
 * fields (unit, quick-add) are new.
 *
 * Display Options (header, like dashboard2) are listed in
 * src/components/admin/billing2/displayOptions.ts.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/billing2/
 *   src/components/admin/billing2/
 * Nothing else imports them. (The quick-add API route and the `unit` field
 * are shared with the original billing screen, so those stay either way.)
 */
export default async function Billing2Page({ searchParams }: Billing2PageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_billing")) {
    redirect("/staff/login");
  }

  const resolvedSearchParams = await searchParams;

  const [products, coupons, customers, business] = await Promise.all([
    prisma.ecomProduct.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, sku: true, barcode: true, price: true, salePrice: true,
        gstRate: true, stockQty: true, productType: true, categoryId: true, subcategoryId: true, unit: true, image: true, brandId: true,
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

  // Campaign prices, when a campaign is live: shown to the cashier as the sale price and
  // charged again (freshly worked out) by the checkout API.
  const campaign = await campaignSalePrices(products);

  let preselectedCustomer = null;
  const customerIdParam = resolvedSearchParams.customer_id;
  if (customerIdParam && /^\d+$/.test(customerIdParam)) {
    preselectedCustomer = await prisma.ecomCustomer.findUnique({
      where: { id: Number(customerIdParam) },
      select: { id: true, name: true, phone: true },
    });
  }

  return (
    // Provider wraps the shell: the Display Options control sits in the
    // header while the parts it hides live in the page body (same as dashboard2).
    <DashboardWidgetPrefsProvider prefKey={BILLING2_PREF_KEY} groups={BILLING2_GROUPS} standalone={BILLING2_STANDALONE}>
    <AdminShell
      siteName="EduMint24"
      pageTitle="Billing / POS"
      pageSubtitle="Scan a barcode or search a product to start a sale"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
      headerActions={
        <div className="hidden items-center gap-3 xl:flex">
          <DisplayOptionsPanel variant="header" />
          <GlobalSearchBar variant="toolbar" />
        </div>
      }
    >
      {/* Below 1280px the header has no room, so the same controls move here. */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3 xl:hidden">
        <DisplayOptionsPanel variant="toolbar" />
        <GlobalSearchBar variant="toolbar" />
      </div>
      <Billing2Screen
        allProducts={products.map((p: (typeof products)[number]) => ({
          id: p.id, name: p.name, sku: p.sku, barcode: p.barcode,
          price: Number(p.price), salePrice: campaign.get(p.id) ?? (p.salePrice ? Number(p.salePrice) : null),
          gstRate: Number(p.gstRate), stockQty: p.stockQty, productType: p.productType,
          categoryId: p.categoryId, subcategoryId: p.subcategoryId, unit: p.unit, image: p.image,
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
          business: {
            name: business?.businessName ?? "My Store",
            address: business?.address ?? null,
            phones: Array.isArray(business?.contactNumbers) ? (business!.contactNumbers as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()) : business?.phone ? [business.phone] : [],
            gstin: business?.showGstinOnInvoice ? business?.gstin ?? null : null,
          },
        }}
        preselectedCustomer={preselectedCustomer}
      />
    </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
