/**
 * Invoice settings (Business Settings → Invoice Settings), stored as one JSON
 * row in storefront_settings under "invoice". Plain types and defaults so the
 * admin preview and the printed invoice render from exactly the same data.
 *
 * Business details (address, phones, GSTIN…) come from the business profile
 * unless a value is typed here: an empty `value` means "use the profile".
 */

export type PrintChoice = "a4" | "thermal" | "ask";
export type ThermalTemplate = "classic" | "modern" | "compact" | "gst";
export type ThermalWidth = "58mm" | "80mm";

export interface InvoiceField { show: boolean; value: string }
export interface ExtraId { label: string; value: string; show: boolean }

export interface InvoiceSettings {
  defaultPrint: PrintChoice;
  autoPrint: boolean;
  thermalWidth: ThermalWidth;
  thermalTemplate: ThermalTemplate;
  thermalFont: "sm" | "md" | "lg";
  accent: string;
  title: string;

  showName: boolean;
  showLogo: boolean;
  logoWidth: number;
  showTagline: boolean;

  showInvoiceNo: boolean;
  showDate: boolean;
  showTime: boolean;
  showCustomer: boolean;
  showPaymentMode: boolean;
  showBarcode: boolean;
  showHsn: boolean;
  showTaxBreakup: boolean;
  showAmountInWords: boolean;
  showSignature: boolean;

  address: InvoiceField;
  location: InvoiceField;
  phones: InvoiceField;
  email: InvoiceField;
  gstin: InvoiceField;
  pan: InvoiceField;
  fssai: InvoiceField;
  extraIds: ExtraId[];

  footerNote: string;
  terms: string;
  signatureLabel: string;
}

/** What the business profile already knows — the fallback for every field above. */
export interface InvoiceProfile {
  businessName: string;
  tagline: string;
  logo: string | null;
  address: string;
  location: string;
  phones: string[];
  email: string;
  gstin: string;
  pan: string;
  fssai: string;
  state: string;
}

export const THERMAL_TEMPLATES: { id: ThermalTemplate; name: string; blurb: string }[] = [
  { id: "classic", name: "Classic", blurb: "Monospace, dashed lines — the familiar till slip" },
  { id: "modern", name: "Modern", blurb: "Clean sans-serif with a bold total box" },
  { id: "compact", name: "Compact", blurb: "Two-line items, least paper" },
  { id: "gst", name: "GST Detailed", blurb: "HSN, GST % per item and a tax summary" },
];

const field = (show: boolean): InvoiceField => ({ show, value: "" });

export const DEFAULT_INVOICE: InvoiceSettings = {
  defaultPrint: "a4",
  autoPrint: false,
  thermalWidth: "80mm",
  thermalTemplate: "classic",
  thermalFont: "md",
  accent: "#9f2089",
  title: "Tax Invoice",
  showName: true,
  showLogo: true,
  logoWidth: 120,
  showTagline: false,
  showInvoiceNo: true,
  showDate: true,
  showTime: true,
  showCustomer: true,
  showPaymentMode: true,
  showBarcode: true,
  showHsn: true,
  showTaxBreakup: true,
  showAmountInWords: true,
  showSignature: true,
  address: field(true),
  location: field(true),
  phones: field(true),
  email: field(true),
  gstin: field(true),
  pan: field(false),
  fssai: field(false),
  extraIds: [],
  footerNote: "Thank you, visit again!",
  terms: "",
  signatureLabel: "Authorised Signatory",
};

/** Everything an invoice prints about the seller, after profile fallbacks and on/off switches. */
export interface ResolvedSeller {
  name: string | null;
  tagline: string | null;
  logo: string | null;
  address: string | null;
  location: string | null;
  phones: string | null;
  email: string | null;
  ids: { label: string; value: string }[];
  gstin: string | null;
}

export function resolveSeller(s: InvoiceSettings, p: InvoiceProfile): ResolvedSeller {
  const pick = (f: InvoiceField, fallback: string) => (f.show ? (f.value.trim() || fallback.trim()) || null : null);
  const gstin = pick(s.gstin, p.gstin);
  const ids: { label: string; value: string }[] = [];
  if (gstin) ids.push({ label: "GSTIN", value: gstin });
  const pan = pick(s.pan, p.pan);
  if (pan) ids.push({ label: "PAN", value: pan });
  const fssai = pick(s.fssai, p.fssai);
  if (fssai) ids.push({ label: "FSSAI Lic. No.", value: fssai });
  for (const x of s.extraIds) if (x.show && x.label.trim() && x.value.trim()) ids.push({ label: x.label.trim(), value: x.value.trim() });
  return {
    name: s.showName || !(s.showLogo && p.logo) ? p.businessName || "My Business" : null,
    tagline: s.showTagline && p.tagline.trim() ? p.tagline.trim() : null,
    logo: s.showLogo ? p.logo : null,
    address: pick(s.address, p.address),
    location: pick(s.location, p.location),
    phones: pick(s.phones, p.phones.join(", ")),
    email: pick(s.email, p.email),
    ids,
    gstin,
  };
}

/** Stored logos are "uploads/…"; the settings preview may pass a blob: or absolute URL. */
export const logoSrc = (logo: string) => (/^(blob:|data:|https?:|\/)/.test(logo) ? logo : `/${logo}`);
