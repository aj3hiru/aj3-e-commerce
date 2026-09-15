import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BusinessSettingsForm } from "@/components/admin/BusinessSettingsForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface BusinessSettingsPageProps {
  searchParams: Promise<{ success?: string }>;
}

export default async function BusinessSettingsPage({ searchParams }: BusinessSettingsPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    redirect("/shop/login");
  }
  const params = await searchParams;
  const biz = await prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } });

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Business Setting"
      pageSubtitle="Your business profile, SEO details, and everything that appears on invoices and your storefront"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success === "1" && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          Business profile saved successfully!
        </div>
      )}

      <BusinessSettingsForm
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
          contactNumbers: (biz?.contactNumbers as string[]) ?? [],
          invoiceNumbers: (biz?.invoiceContactNumbers as string[]) ?? [],
          socialMedia: (biz?.socialMediaJson as { platform: string; url: string }[]) ?? [],
        }}
      />
    </AdminShell>
  );
}
