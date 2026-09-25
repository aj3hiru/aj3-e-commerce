import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BusinessSettingsForm } from "@/components/admin/BusinessSettingsForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { getShopHeaderSettings } from "@/lib/header-settings";
import { getStorefrontConfig } from "@/lib/storefront-config";
import { getInvoiceSetup } from "@/lib/invoice-settings";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { BS_GROUPS, BS_PREF_KEY, BS_STANDALONE } from "@/components/admin/business-settings-display";

interface BusinessSettingsPageProps {
  searchParams: Promise<{ success?: string; header?: string; section?: string }>;
}

export default async function BusinessSettingsPage({ searchParams }: BusinessSettingsPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    redirect("/staff/login");
  }
  const params = await searchParams;
  const biz = await prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } });
  // Pass business_hours as `undefined` here, NOT as the fallback: this form
  // must show whether a delivery-time text was actually configured, and
  // pre-filling it with business_hours would silently copy that value into
  // ecom_home_settings on the next save, breaking the fallback for good.
  const header = await getShopHeaderSettings(null);
  const [storefront, categoryRows, invoiceSetup] = await Promise.all([
    getStorefrontConfig(),
    prisma.ecomCategory.findMany({ where: { status: "active" }, orderBy: { serial: "asc" }, select: { slug: true, name: true } }),
    getInvoiceSetup(),
  ]);

  // Legacy fallbacks, ported from business-settings.php:130-132. Without these
  // a row saved before contact_numbers/invoice_contact_numbers existed opens
  // with the fields empty — and because the form writes back exactly what is
  // in state, the very next save would wipe `phone` and clear every
  // invoice-number selection. The PHP:
  //   $contact_numbers = contact_numbers ?: (phone ? [phone] : ['']);
  //   $invoice_numbers = invoice_contact_numbers ?: $contact_numbers;
  const storedContacts = (biz?.contactNumbers as string[] | null) ?? [];
  const contactNumbers = storedContacts.length
    ? storedContacts
    : biz?.phone
      ? [biz.phone]
      : [""];
  const storedInvoiceNumbers = (biz?.invoiceContactNumbers as string[] | null) ?? [];
  // An unset list means "all of them"; an explicitly emptied one stays empty,
  // which is why the length check is on the stored value, not the fallback.
  const invoiceNumbers = storedInvoiceNumbers.length ? storedInvoiceNumbers : contactNumbers.filter(Boolean);

  return (
    <DashboardWidgetPrefsProvider prefKey={BS_PREF_KEY} groups={BS_GROUPS} standalone={BS_STANDALONE}>
    <AdminShell
      siteName="EduMint24"
      pageTitle="Business Settings"
      pageSubtitle="Your business profile, SEO details, and everything that appears on invoices and your storefront"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
      headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}
    >
      <div className="mb-4 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
      {params.success === "1" && params.header !== "failed" && (
        <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          Business profile saved successfully!
        </div>
      )}
      {params.header === "failed" && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Business profile saved, but the Storefront Header settings could not be written — the storefront
          customizer table may be missing. Everything else was saved.
        </div>
      )}

      <BusinessSettingsForm
        storefrontInitial={storefront}
        invoiceInitial={invoiceSetup.settings}
        permissions={session.permissions}
        section={params.section}
        categories={categoryRows as { slug: string; name: string }[]}
        initial={{
          businessName: biz?.businessName ?? "",
          tagline: biz?.tagline ?? "",
          seoDescription: biz?.seoDescription ?? "",
          address: biz?.address ?? "",
          location: biz?.location ?? "",
          email: biz?.email ?? "",
          websiteUrl: biz?.websiteUrl ?? "",
          businessHours: biz?.businessHours ?? "",
          gstin: biz?.gstin ?? "",
          panNumber: biz?.panNumber ?? "",
          fssaiNumber: biz?.fssaiNumber ?? "",
          state: biz?.state ?? "",
          showGstinOnInvoice: biz?.showGstinOnInvoice ?? false,
          showPanOnInvoice: biz?.showPanOnInvoice ?? false,
          showFssaiOnInvoice: biz?.showFssaiOnInvoice ?? false,
          showAddressOnInvoice: biz?.showAddressOnInvoice ?? false,
          showLocationOnInvoice: biz?.showLocationOnInvoice ?? false,
          siteHeaderDisplay: biz?.siteHeaderDisplay ?? "both",
          invoiceDisplay: biz?.invoiceDisplay ?? "both",
          invoiceTitle: biz?.invoiceTitle ?? "Tax Invoice",
          invoiceFooterNote: biz?.invoiceFooterNote ?? "",
          returnPolicy: biz?.returnPolicy ?? "",
          printerFormat: biz?.printerFormat ?? "a4",
          barcodeFooterText: biz?.barcodeFooterText ?? "",
          orderIdPrefix: biz?.orderIdPrefix ?? "ORD",
          posPrintMode: biz?.posPrintMode ?? "both",
          shortcutCompleteSale: biz?.shortcutCompleteSale ?? "F2",
          shortcutPrint: biz?.shortcutPrint ?? "F3",
          shortcutNewSale: biz?.shortcutNewSale ?? "F4",
          logoDisplayWidth: biz?.logoDisplayWidth ?? 150,
          logo: biz?.logo ?? null,
          contactNumbers,
          invoiceNumbers,
          socialMedia: (biz?.socialMediaJson as { platform: string; url: string }[]) ?? [],
          headerShowLocation: header.showLocation,
          headerShowDeliveryInfo: header.showDeliveryInfo,
          headerDeliveryLabel: header.deliveryLabel,
          headerDeliveryTimeText: header.deliveryTimeText,
          headerSearchPlaceholder: header.searchPlaceholder,
        }}
      />
    </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
