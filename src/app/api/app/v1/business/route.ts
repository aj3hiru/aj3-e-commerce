import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appSession } from "@/lib/app-api";
import { hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

/** Business Settings from the staff app: only the fields sent change (text, switches and choices). */
const TEXT = ["businessName", "tagline", "address", "location", "email", "websiteUrl", "businessHours", "gstin", "panNumber", "fssaiNumber", "state", "invoiceTitle", "invoiceFooterNote", "returnPolicy", "barcodeFooterText", "orderIdPrefix"] as const;
const BOOL = ["showGstinOnInvoice", "showPanOnInvoice", "showFssaiOnInvoice", "showAddressOnInvoice", "showLocationOnInvoice"] as const;
const CHOICE: Record<string, string[]> = {
  posPrintMode: ["both", "thermal", "a4"], printerFormat: ["a4", "thermal_58", "thermal_80"],
  shortcutCompleteSale: Array.from({ length: 11 }, (_, i) => `F${i + 2}`), shortcutPrint: Array.from({ length: 11 }, (_, i) => `F${i + 2}`), shortcutNewSale: Array.from({ length: 11 }, (_, i) => `F${i + 2}`),
  invoiceDisplay: ["logo", "name", "both"], siteHeaderDisplay: ["title", "logo", "both"],
};

async function handlePATCH(req: NextRequest) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  if (!hasPermission(s.permissions, "ecommerce", "manage_payment")) return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const k of TEXT) if (typeof b[k] === "string") data[k] = (b[k] as string).trim().slice(0, k.endsWith("Note") || k === "returnPolicy" || k === "address" ? 5000 : 255) || (k === "businessName" || k === "orderIdPrefix" || k === "invoiceTitle" ? undefined : null);
  for (const k of BOOL) if (typeof b[k] === "boolean") data[k] = b[k];
  for (const [k, list] of Object.entries(CHOICE)) if (typeof b[k] === "string" && list.includes(b[k] as string)) data[k] = b[k];
  if (Array.isArray(b.contactNumbers)) {
    const nums = (b.contactNumbers as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
    data.contactNumbers = nums;
    data.phone = nums[0] ?? null;
  }
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  if (data.businessName === "") return NextResponse.json({ success: false, message: "Business name is required." }, { status: 400 });
  if (!Object.keys(data).length) return NextResponse.json({ success: true });
  const cur = await prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
  if (cur) await prisma.ecomBusinessSettings.update({ where: { id: cur.id }, data });
  else await prisma.ecomBusinessSettings.create({ data: { businessName: String(data.businessName ?? "My Store"), ...data } });
  await logActivity(req, s.userId, "business_settings_update", `Business settings (app): ${Object.keys(data).join(", ")}`);
  return NextResponse.json({ success: true });
}

export const PATCH = withApiErrors(handlePATCH);
