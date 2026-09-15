import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveUploadedImage } from "@/lib/upload";

const VALID_FKEYS = Array.from({ length: 11 }, (_, i) => `F${i + 2}`); // F2..F12

/** Verified against admin/ecommerce/business-settings.php's single-row upsert logic:
 *  reads every field, validates enum-like fields against an allow-list (falling back
 *  to a safe default exactly like the PHP in_array() checks), handles the
 *  multi-value contact_numbers/invoice_numbers arrays and the dynamic social_media
 *  list, and optionally replaces the logo. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const form = await req.formData();
  const str = (key: string, fallback = "") => ((form.get(key) as string | null) ?? fallback).trim();
  const bool = (key: string) => form.get(key) === "1" || form.get(key) === "on";
  const oneOf = (key: string, allowed: string[], fallback: string) => {
    const v = form.get(key) as string | null;
    return v && allowed.includes(v) ? v : fallback;
  };

  const businessName = str("business_name");
  if (!businessName) {
    return NextResponse.json({ success: false, message: "Business name is required." }, { status: 400 });
  }

  // Multiple contact numbers arrive as repeated form fields: contact_numbers[]=..&contact_numbers[]=..
  const contactNumbersClean = form.getAll("contact_numbers[]").map((v) => String(v).trim()).filter(Boolean);
  const phone = contactNumbersClean[0] ?? "";
  const invoiceNumbersRaw = form.getAll("invoice_numbers[]").map(String);
  const invoiceNumbersClean = contactNumbersClean.filter((n) => invoiceNumbersRaw.includes(n));

  // Social media — parallel arrays social_platform[]/social_url[]
  const platforms = form.getAll("social_platform[]").map(String);
  const urls = form.getAll("social_url[]").map(String);
  const socialList = platforms
    .map((platform, i) => ({ platform, url: (urls[i] ?? "").trim() }))
    .filter((s) => s.url !== "");

  const logoFile = form.get("logo") as File | null;
  let logoPath: string | undefined;
  if (logoFile && logoFile.size > 0) {
    logoPath = await saveUploadedImage(logoFile, "ecommerce/business", "logo");
  }

  const logoDisplayWidth = Math.max(40, Math.min(400, Number(form.get("logo_display_width") ?? 150) || 150));

  const existing = await prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } });

  const data = {
    businessName,
    tagline: str("tagline") || null,
    seoDescription: str("seo_description") || null,
    address: str("address") || null,
    location: str("location") || null,
    phone: phone || null,
    contactNumbers: contactNumbersClean,
    invoiceContactNumbers: invoiceNumbersClean,
    email: str("email") || null,
    websiteUrl: str("website_url") || null,
    businessHours: str("business_hours") || null,
    gstin: str("gstin").toUpperCase() || null,
    panNumber: str("pan_number").toUpperCase() || null,
    fssaiNumber: str("fssai_number") || null,
    state: str("state") || null,
    showGstinOnInvoice: bool("show_gstin_on_invoice"),
    showPanOnInvoice: bool("show_pan_on_invoice"),
    showFssaiOnInvoice: bool("show_fssai_on_invoice"),
    showAddressOnInvoice: bool("show_address_on_invoice"),
    showLocationOnInvoice: bool("show_location_on_invoice"),
    siteHeaderDisplay: oneOf("site_header_display", ["title", "logo", "both"], "both"),
    invoiceDisplay: oneOf("invoice_display", ["logo", "name", "both"], "both"),
    invoiceTitle: str("invoice_title", "Tax Invoice"),
    invoiceFooterNote: str("invoice_footer_note") || null,
    returnPolicy: str("return_policy") || null,
    printerFormat: oneOf("printer_format", ["a4", "thermal_58", "thermal_80"], "a4"),
    barcodeFooterText: str("barcode_footer_text") || null,
    orderIdPrefix: str("order_id_prefix", "ORD").toUpperCase(),
    posPrintMode: oneOf("pos_print_mode", ["thermal", "a4", "both"], "both"),
    shortcutCompleteSale: oneOf("shortcut_complete_sale", VALID_FKEYS, "F2"),
    shortcutPrint: oneOf("shortcut_print", VALID_FKEYS, "F3"),
    shortcutNewSale: oneOf("shortcut_new_sale", VALID_FKEYS, "F4"),
    logoDisplayWidth,
    socialMediaJson: socialList,
    ...(logoPath ? { logo: logoPath } : {}),
  };

  if (existing) {
    await prisma.ecomBusinessSettings.update({ where: { id: existing.id }, data });
  } else {
    await prisma.ecomBusinessSettings.create({ data });
  }

  await logActivity(req, session.userId, "ecom_business_settings_update", "Updated business profile settings");

  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/business-settings?success=1" });
}
