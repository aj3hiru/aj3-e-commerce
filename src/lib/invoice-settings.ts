import { prisma } from "@/lib/db";
import {
  DEFAULT_INVOICE, THERMAL_TEMPLATES,
  type ExtraId, type InvoiceField, type InvoiceProfile, type InvoiceSettings,
} from "@/types/invoice-settings";

const KEY = "invoice";
type R = Record<string, unknown>;
const obj = (v: unknown): R => (v && typeof v === "object" && !Array.isArray(v) ? (v as R) : {});
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, max: number, d = "") => (typeof v === "string" ? v.slice(0, max) : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const fld = (v: unknown, d: InvoiceField, max = 300): InvoiceField => { const o = obj(v); return { show: bool(o.show, d.show), value: str(o.value, max) }; };

export function sanitizeInvoice(input: unknown, base: InvoiceSettings = DEFAULT_INVOICE): InvoiceSettings {
  const r = obj(input);
  const d = base;
  const extra: ExtraId[] = Array.isArray(r.extraIds)
    ? r.extraIds.slice(0, 6).map((x) => { const o = obj(x); return { label: str(o.label, 40), value: str(o.value, 80), show: bool(o.show, true) }; })
    : d.extraIds;
  return {
    defaultPrint: oneOf(r.defaultPrint, ["a4", "thermal", "ask"] as const, d.defaultPrint),
    autoPrint: bool(r.autoPrint, d.autoPrint),
    thermalWidth: oneOf(r.thermalWidth, ["58mm", "80mm"] as const, d.thermalWidth),
    thermalTemplate: oneOf(r.thermalTemplate, THERMAL_TEMPLATES.map((t) => t.id), d.thermalTemplate),
    thermalFont: oneOf(r.thermalFont, ["sm", "md", "lg"] as const, d.thermalFont),
    accent: /^#[0-9a-f]{6}$/i.test(String(r.accent)) ? String(r.accent) : d.accent,
    title: str(r.title, 40, d.title),
    showName: bool(r.showName, d.showName),
    showLogo: bool(r.showLogo, d.showLogo),
    logoWidth: Math.min(220, Math.max(40, Number(r.logoWidth) || d.logoWidth)),
    showTagline: bool(r.showTagline, d.showTagline),
    showInvoiceNo: bool(r.showInvoiceNo, d.showInvoiceNo),
    showDate: bool(r.showDate, d.showDate),
    showTime: bool(r.showTime, d.showTime),
    showCustomer: bool(r.showCustomer, d.showCustomer),
    showPaymentMode: bool(r.showPaymentMode, d.showPaymentMode),
    showBarcode: bool(r.showBarcode, d.showBarcode),
    showHsn: bool(r.showHsn, d.showHsn),
    showTaxBreakup: bool(r.showTaxBreakup, d.showTaxBreakup),
    showAmountInWords: bool(r.showAmountInWords, d.showAmountInWords),
    showSignature: bool(r.showSignature, d.showSignature),
    address: fld(r.address, d.address, 400),
    location: fld(r.location, d.location, 120),
    phones: fld(r.phones, d.phones, 120),
    email: fld(r.email, d.email, 120),
    gstin: fld(r.gstin, d.gstin, 20),
    pan: fld(r.pan, d.pan, 12),
    fssai: fld(r.fssai, d.fssai, 20),
    extraIds: extra,
    footerNote: str(r.footerNote, 300, d.footerNote),
    terms: str(r.terms, 1200, d.terms),
    signatureLabel: str(r.signatureLabel, 40, d.signatureLabel),
  };
}

type Biz = Awaited<ReturnType<typeof prisma.ecomBusinessSettings.findFirst>>;

/** Before anything is saved here, start from what the old Invoice Format / Print Display settings said. */
function legacyDefaults(biz: Biz): InvoiceSettings {
  if (!biz) return DEFAULT_INVOICE;
  const display = biz.invoiceDisplay ?? "both";
  const fmt = biz.printerFormat ?? "a4";
  return {
    ...DEFAULT_INVOICE,
    defaultPrint: fmt.startsWith("thermal") ? "thermal" : "a4",
    thermalWidth: fmt === "thermal_58" ? "58mm" : "80mm",
    title: biz.invoiceTitle || DEFAULT_INVOICE.title,
    showName: display !== "logo",
    showLogo: display !== "name",
    logoWidth: Math.min(220, biz.logoDisplayWidth ?? DEFAULT_INVOICE.logoWidth),
    address: { show: biz.showAddressOnInvoice ?? true, value: "" },
    location: { show: biz.showLocationOnInvoice ?? true, value: "" },
    gstin: { show: biz.showGstinOnInvoice ?? true, value: "" },
    pan: { show: biz.showPanOnInvoice ?? false, value: "" },
    fssai: { show: biz.showFssaiOnInvoice ?? false, value: "" },
    footerNote: biz.invoiceFooterNote || DEFAULT_INVOICE.footerNote,
    terms: biz.returnPolicy ?? "",
  };
}

export function invoiceProfile(biz: Biz): InvoiceProfile {
  const contacts = (biz?.contactNumbers as string[] | null) ?? [];
  const chosen = (biz?.invoiceContactNumbers as string[] | null) ?? [];
  const phones = (chosen.length ? chosen : contacts.length ? contacts : biz?.phone ? [biz.phone] : []).filter(Boolean);
  return {
    businessName: biz?.businessName ?? "My Business",
    tagline: biz?.tagline ?? "",
    logo: biz?.logo ?? null,
    address: biz?.address ?? "",
    location: biz?.location ?? "",
    phones,
    email: biz?.email ?? "",
    gstin: biz?.gstin ?? "",
    pan: biz?.panNumber ?? "",
    fssai: biz?.fssaiNumber ?? "",
    state: biz?.state ?? "",
  };
}

export async function getInvoiceSetup(): Promise<{ settings: InvoiceSettings; profile: InvoiceProfile }> {
  const biz = await prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } });
  const base = legacyDefaults(biz);
  let settings = base;
  try {
    const row = await prisma.storefrontSetting.findUnique({ where: { key: KEY } });
    if (row) settings = sanitizeInvoice(row.value, base);
  } catch { /* table missing — defaults */ }
  return { settings, profile: invoiceProfile(biz) };
}

export async function saveInvoiceSettings(input: unknown): Promise<InvoiceSettings> {
  const value = sanitizeInvoice(input);
  await prisma.storefrontSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value as unknown as object }, update: { value: value as unknown as object } });
  return value;
}
