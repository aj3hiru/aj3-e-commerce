import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { TaxSettings2Body, Tax2AddButton, type TaxRate2Row } from "@/components/admin/tax-settings2/TaxSettings2Body";
import { TAX2_GROUPS, TAX2_PREF_KEY, TAX2_STANDALONE } from "@/components/admin/tax-settings2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/**
 * /admin/ecommerce/tax-settings2 — a trial redesign of GST/Tax Settings,
 * kept alongside /admin/ecommerce/tax-settings so the two can be compared.
 * Same access rule (manage_products — matches the v1 page, since GST rates
 * are product-attached, not billing-attached), same ecom_gst_rates table.
 *
 * "Products" per slab and "Products Without a Matching Slab" are real
 * numbers: ecom_products.gst_rate is a plain decimal copied onto each
 * product at save time (verified in schema.prisma — it is NOT a foreign key
 * to ecom_gst_rates), so a product's current rate can drift from every
 * defined slab if a slab is edited or deleted after the fact. Counting by
 * matching decimal value surfaces that honestly instead of assuming every
 * product still lines up with a named slab.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/tax-settings2/
 *   src/components/admin/tax-settings2/
 *   src/app/api/ecommerce/tax-rates2/
 *   src/lib/tax2-save.ts
 */
export default async function TaxSettings2Page() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/staff/login");
  }

  const [ratesRaw, productRates] = await Promise.all([
    prisma.ecomGstRate.findMany({ orderBy: { rate: "asc" } }),
    prisma.ecomProduct.findMany({ select: { gstRate: true } }),
  ]);

  const rates = ratesRaw as { id: number; label: string; rate: unknown; isDefault: boolean }[];
  const rateValues = (productRates as { gstRate: unknown }[]).map((p) => Number(p.gstRate));

  const countAt = (rate: number) => rateValues.filter((v) => Math.abs(v - rate) < 0.001).length;
  const definedRates = new Set(rates.map((r) => Number(r.rate)));
  const orphanProducts = rateValues.filter((v) => ![...definedRates].some((d) => Math.abs(d - v) < 0.001)).length;

  const rows: TaxRate2Row[] = rates.map((r) => ({
    id: r.id, label: r.label, rate: Number(r.rate), isDefault: r.isDefault, productCount: countAt(Number(r.rate)),
  }));

  return (
    <DashboardWidgetPrefsProvider prefKey={TAX2_PREF_KEY} groups={TAX2_GROUPS} standalone={TAX2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="GST / Tax Settings"
        pageSubtitle="Manage GST slabs used across products, billing, and checkout"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /><Tax2AddButton /></div>}
      >
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" /><Tax2AddButton />
        </div>
        <TaxSettings2Body rates={rows} orphanProducts={orphanProducts} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
