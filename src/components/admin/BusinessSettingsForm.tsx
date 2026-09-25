"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, ImagePlus, Building2, Contact, Share2, FileSpreadsheet,
  Keyboard, Barcode, Image as ImageIcon, Save,
} from "lucide-react";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";
import type { StorefrontConfig } from "@/types/storefront";
import type { InvoiceSettings } from "@/types/invoice-settings";
import { InvoiceSettingsPanel } from "./invoice-settings/InvoiceSettingsPanel";
import { StorePreview } from "./store-preview/StorePreview";
import { FORM_SECTION_KEYS, settingsMenu } from "./SettingsHub";
import { BS_MENU_KEYS } from "./business-settings-display";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { ShopCategoryNavItem, SocialPlatform } from "@/types/shop";
import {
  SettingsMenuLayout, SettingsPanel, Field, CONTROL_CLASS,
} from "./SettingsMenuLayout";

export interface BusinessSettingsInitial {
  businessName: string;
  tagline: string;
  seoDescription: string;
  address: string;
  location: string;
  email: string;
  websiteUrl: string;
  businessHours: string;
  gstin: string;
  panNumber: string;
  fssaiNumber: string;
  state: string;
  showGstinOnInvoice: boolean;
  showPanOnInvoice: boolean;
  showFssaiOnInvoice: boolean;
  showAddressOnInvoice: boolean;
  showLocationOnInvoice: boolean;
  siteHeaderDisplay: string;
  invoiceDisplay: string;
  invoiceTitle: string;
  invoiceFooterNote: string;
  returnPolicy: string;
  printerFormat: string;
  barcodeFooterText: string;
  orderIdPrefix: string;
  posPrintMode: string;
  shortcutCompleteSale: string;
  shortcutPrint: string;
  shortcutNewSale: string;
  logoDisplayWidth: number;
  logo: string | null;
  contactNumbers: string[];
  invoiceNumbers: string[];
  socialMedia: { platform: string; url: string }[];

  // ── Storefront header strip ────────────────────────────────────────────
  // Stored in ecom_home_settings (see lib/header-settings.ts); surfaced here
  // because this is where a store owner looks for "what my shop header says".
  headerShowLocation: boolean;
  headerShowDeliveryInfo: boolean;
  headerDeliveryLabel: string;
  headerDeliveryTimeText: string;
  headerSearchPlaceholder: string;
}

/** Sections that change what shoppers see — they get the live store preview on the right. */
const PREVIEW_SECTIONS = ["identity", "contact", "social", "branding"];
/** Details shown in the store footer — the preview scrolls there. */
const FOOTER_SECTIONS = ["contact", "social"];

const FKEYS = Array.from({ length: 11 }, (_, i) => `F${i + 2}`);

/**
 * Menu order follows how often a shop owner touches each group: identity and
 * contact first, then the storefront, then the paperwork, then the hardware.
 */

/** `storefrontInitial` feeds the live preview only — menus and footer are edited in Store Customizer. */
export function BusinessSettingsForm({ initial, storefrontInitial: storefront, invoiceInitial, permissions, section }: {
  initial: BusinessSettingsInitial; storefrontInitial: StorefrontConfig; invoiceInitial: InvoiceSettings; categories: ShopCategoryNavItem[];
  permissions: Record<string, Record<string, boolean>>; section?: string;
}) {
  const { isVisible } = useDashboardWidgetPrefs();
  const menu = useMemo(() => {
    const hidden = new Set(BS_MENU_KEYS.map(([k]) => k).filter((k) => isVisible("bs-menu") && !isVisible(`bs-m-${k}`)));
    return settingsMenu(permissions, true, hidden);
  }, [permissions, isVisible]);
  const [invoice, setInvoice] = useState(invoiceInitial);
  const router = useRouter();
  const [active, setActive] = useState(section && FORM_SECTION_KEYS.includes(section) ? section : "identity");
  const [form, setForm] = useState(initial);
  const [contactNumbers, setContactNumbers] = useState(initial.contactNumbers.length ? initial.contactNumbers : [""]);
  const [invoiceNumbers, setInvoiceNumbers] = useState<string[]>(initial.invoiceNumbers);
  const [socialMedia, setSocialMedia] = useState(initial.socialMedia);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logo ? `/${initial.logo}` : null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof BusinessSettingsInitial>(key: K, value: BusinessSettingsInitial[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleLogoChange(file: File | null) {
    setLogoFile(file);
    if (file) setLogoPreview(URL.createObjectURL(file));
  }

  // Live store preview for the storefront-facing sections (unsaved edits included).
  // A section hidden in Display Options while open → show the first visible one.
  useEffect(() => { if (menu.length && !menu.some((m) => m.key === active && !m.href)) { const first = menu.find((m) => !m.href); if (first) setActive(first.key); } }, [menu, active]);
  const withPreview = PREVIEW_SECTIONS.includes(active) && isVisible("bs-preview");
  const previewState = useMemo(() => ({
    business: {
      businessName: form.businessName || "Your Store", logo: logoPreview, tagline: form.tagline, email: form.email,
      address: form.address, location: form.location, businessHours: form.businessHours, returnPolicy: form.returnPolicy,
      contactNumbers: contactNumbers.filter(Boolean),
      socialMedia: socialMedia.filter((sm) => sm.url && sm.platform !== "other") as { platform: SocialPlatform; url: string }[],
      headerDisplay: (["logo", "name", "both"].includes(form.siteHeaderDisplay) ? form.siteHeaderDisplay : "logo") as "logo" | "name" | "both",
      logoWidth: form.logoDisplayWidth,
    },
    header: {
      showLocation: form.headerShowLocation, showDeliveryInfo: form.headerShowDeliveryInfo, deliveryLabel: form.headerDeliveryLabel,
      deliveryTimeText: form.headerDeliveryTimeText || form.businessHours, searchPlaceholder: form.headerSearchPlaceholder,
    },
    storefront,
    drawer: false,
    focus: (FOOTER_SECTIONS.includes(active) ? "footer" : "top") as "top" | "footer",
  }), [form, logoPreview, contactNumbers, socialMedia, storefront, active]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    setSubmitting(true);
    try {
      const res = await fetch("/api/ecommerce/invoice-settings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(invoice),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) { setError(data.message || "Invoice settings couldn't be saved."); setActive("invoice"); setSubmitting(false); return; }
    } catch {
      setError("Something went wrong saving invoice settings. Please try again.");
      setSubmitting(false);
      return;
    }

    const fd = new FormData();
    fd.set("business_name", form.businessName);
    fd.set("tagline", form.tagline);
    fd.set("seo_description", form.seoDescription);
    fd.set("address", form.address);
    fd.set("location", form.location);
    fd.set("email", form.email);
    fd.set("website_url", form.websiteUrl);
    fd.set("business_hours", form.businessHours);
    fd.set("gstin", form.gstin);
    fd.set("pan_number", form.panNumber);
    fd.set("fssai_number", form.fssaiNumber);
    fd.set("state", form.state);
    if (form.showGstinOnInvoice) fd.set("show_gstin_on_invoice", "1");
    if (form.showPanOnInvoice) fd.set("show_pan_on_invoice", "1");
    if (form.showFssaiOnInvoice) fd.set("show_fssai_on_invoice", "1");
    if (form.showAddressOnInvoice) fd.set("show_address_on_invoice", "1");
    if (form.showLocationOnInvoice) fd.set("show_location_on_invoice", "1");
    fd.set("site_header_display", form.siteHeaderDisplay);
    fd.set("invoice_display", form.invoiceDisplay);
    fd.set("invoice_title", form.invoiceTitle);
    fd.set("invoice_footer_note", form.invoiceFooterNote);
    fd.set("return_policy", form.returnPolicy);
    fd.set("printer_format", form.printerFormat);
    fd.set("barcode_footer_text", form.barcodeFooterText);
    fd.set("order_id_prefix", form.orderIdPrefix);
    fd.set("pos_print_mode", form.posPrintMode);
    fd.set("shortcut_complete_sale", form.shortcutCompleteSale);
    fd.set("shortcut_print", form.shortcutPrint);
    fd.set("shortcut_new_sale", form.shortcutNewSale);
    fd.set("logo_display_width", String(form.logoDisplayWidth));

    contactNumbers.filter(Boolean).forEach((n) => fd.append("contact_numbers[]", n));
    invoiceNumbers.forEach((n) => fd.append("invoice_numbers[]", n));
    socialMedia.forEach((s) => {
      fd.append("social_platform[]", s.platform);
      fd.append("social_url[]", s.url);
    });
    if (logoFile) fd.set("logo", logoFile);

    try {
      const res = await fetch("/api/ecommerce/business-settings", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Save failed.");
        // Business name is the only required field, and it lives in the first
        // panel — jump back to it so the user can see what needs fixing.
        if (!form.businessName.trim()) setActive("identity");
        return;
      }
      router.push(data.redirect);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="mb-4 rounded-[6px] bg-[#fdecee] px-3 py-2.5 text-[13.5px] font-medium text-[#d0263a]" role="alert">
          {error}
        </div>
      )}

      <SettingsMenuLayout items={menu} active={active} onSelect={setActive}>
        <div className={withPreview ? "grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]" : undefined}>
        <div className="min-w-0">
        {/* ══════════ BUSINESS IDENTITY ══════════ */}
        {active === "identity" && (
          <SettingsPanel icon={Building2} title="Business Identity">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Business Name *" htmlFor="businessName">
                <input
                  id="businessName"
                  required
                  value={form.businessName}
                  onChange={(e) => update("businessName", e.target.value)}
                  className={CONTROL_CLASS}
                />
              </Field>
              <Field label="Tagline" htmlFor="tagline">
                <input id="tagline" value={form.tagline} onChange={(e) => update("tagline", e.target.value)} className={CONTROL_CLASS} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="SEO Description" htmlFor="seoDescription" hint="Used as the storefront's meta description.">
                <textarea id="seoDescription" rows={2} value={form.seoDescription} onChange={(e) => update("seoDescription", e.target.value)} className={CONTROL_CLASS} />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Location" htmlFor="location" hint="The short place name shown in the storefront header.">
                <input id="location" value={form.location} onChange={(e) => update("location", e.target.value)} className={CONTROL_CLASS} />
              </Field>
              <Field label="Business Hours" htmlFor="businessHours" hint="Falls back into the header's delivery-time line when that is left blank.">
                <input id="businessHours" value={form.businessHours} onChange={(e) => update("businessHours", e.target.value)} placeholder="e.g. 9 AM - 9 PM" className={CONTROL_CLASS} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Address" htmlFor="address">
                <textarea id="address" rows={2} value={form.address} onChange={(e) => update("address", e.target.value)} className={CONTROL_CLASS} />
              </Field>
            </div>
          </SettingsPanel>
        )}

        {/* ══════════ CONTACT ══════════ */}
        {active === "contact" && (
          <SettingsPanel icon={Contact} title="Contact Information" hint="Tick a number to have it printed on invoices.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Email" htmlFor="email">
                <input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className={CONTROL_CLASS} />
              </Field>
              <Field label="Website URL" htmlFor="websiteUrl">
                <input id="websiteUrl" value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} className={CONTROL_CLASS} />
              </Field>
            </div>

            <div className="mt-4">
              <span className="mb-1.5 block text-[13px] font-medium text-[#616173]">Contact Numbers</span>
              {contactNumbers.map((num, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <input
                    value={num}
                    onChange={(e) =>
                      setContactNumbers((prev) => {
                        const oldValue = prev[i];
                        const next = prev.map((n, idx) => (idx === i ? e.target.value : n));
                        // Keep the invoice selection pointing at this row after
                        // an edit — it is matched by value, so renaming a ticked
                        // number would otherwise silently untick it.
                        setInvoiceNumbers((sel) => sel.map((s) => (s === oldValue ? e.target.value : s)));
                        return next;
                      })
                    }
                    className={CONTROL_CLASS}
                    placeholder="Phone number"
                  />
                  <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[0.8rem] text-admin-gray-600">
                    <input
                      type="checkbox"
                      className="accent-[#9f2089]"
                      checked={invoiceNumbers.includes(num)}
                      onChange={(e) =>
                        setInvoiceNumbers((prev) => (e.target.checked ? [...prev, num] : prev.filter((n) => n !== num)))
                      }
                    />
                    On invoice
                  </label>
                  <button
                    type="button"
                    aria-label="Remove number"
                    onClick={() => {
                      setContactNumbers((prev) => prev.filter((_, idx) => idx !== i));
                      setInvoiceNumbers((prev) => prev.filter((n) => n !== num));
                    }}
                    className="shrink-0 p-1.5 text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setContactNumbers((prev) => [...prev, ""])}
                className="flex items-center gap-1.5 text-[13px] font-bold uppercase text-[#9f2089]"
              >
                <Plus className="h-3.5 w-3.5" /> Add number
              </button>
            </div>
          </SettingsPanel>
        )}

        {/* ══════════ LOGO & BRANDING ══════════ */}
        {active === "branding" && (
          <SettingsPanel icon={ImageIcon} title="Logo & Branding">
            <label
              htmlFor="bizLogo"
              className="mb-3 flex h-28 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-[#dcdce6] bg-[#fafafc] hover:border-[#9f2089]"
            >
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Current logo" className="h-full object-contain" />
              ) : (
                <>
                  <ImagePlus className="h-6 w-6 text-admin-gray-400" />
                  <span className="text-xs text-admin-gray-400">Upload logo</span>
                </>
              )}
            </label>
            <input type="file" id="bizLogo" accept="image/*" className="hidden" onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Site Header Display" htmlFor="siteHeaderDisplay">
                <select id="siteHeaderDisplay" value={form.siteHeaderDisplay} onChange={(e) => update("siteHeaderDisplay", e.target.value)} className={CONTROL_CLASS}>
                  <option value="title">Title only</option>
                  <option value="logo">Logo only</option>
                  <option value="both">Both</option>
                </select>
              </Field>
              <Field label="Logo Display Width (px)" htmlFor="logoDisplayWidth" hint="Clamped between 40 and 400.">
                <input
                  id="logoDisplayWidth"
                  type="number"
                  min={40}
                  max={400}
                  value={form.logoDisplayWidth}
                  onChange={(e) => update("logoDisplayWidth", Math.max(40, Math.min(400, Number(e.target.value) || 150)))}
                  className={CONTROL_CLASS}
                />
              </Field>
            </div>
          </SettingsPanel>
        )}

        {/* ══════════ TAX & LEGAL ══════════ */}
        {active === "tax" && (
          <SettingsPanel
            icon={FileSpreadsheet}
            title="GST & Tax Details"
            hint="Just the values here — whether each one prints on your invoice is set in Invoice Settings."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="GSTIN" htmlFor="gstin">
                <input id="gstin" value={form.gstin} onChange={(e) => update("gstin", e.target.value.toUpperCase())} className={`${CONTROL_CLASS} uppercase`} />
              </Field>
              <Field label="PAN Number" htmlFor="panNumber">
                <input id="panNumber" value={form.panNumber} onChange={(e) => update("panNumber", e.target.value.toUpperCase())} className={`${CONTROL_CLASS} uppercase`} />
              </Field>
              <Field label="FSSAI Number" htmlFor="fssaiNumber">
                <input id="fssaiNumber" value={form.fssaiNumber} onChange={(e) => update("fssaiNumber", e.target.value)} className={CONTROL_CLASS} />
              </Field>
              <Field label="State" htmlFor="state">
                <input id="state" value={form.state} onChange={(e) => update("state", e.target.value)} className={CONTROL_CLASS} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Return Policy" htmlFor="returnPolicy" hint="Shown to customers on the storefront.">
                <textarea id="returnPolicy" rows={3} value={form.returnPolicy} onChange={(e) => update("returnPolicy", e.target.value)} className={CONTROL_CLASS} />
              </Field>
            </div>
          </SettingsPanel>
        )}

        {/* ══════════ INVOICE SETTINGS ══════════ */}
        {active === "invoice" && (
          <InvoiceSettingsPanel value={invoice} onChange={setInvoice}
            profile={{
              // Live values from this form, so the preview follows unsaved edits too.
              businessName: form.businessName || "Your Store", tagline: form.tagline, logo: logoPreview,
              address: form.address, location: form.location, email: form.email,
              phones: (invoiceNumbers.length ? invoiceNumbers : contactNumbers).filter(Boolean),
              gstin: form.gstin, pan: form.panNumber, fssai: form.fssaiNumber, state: form.state,
            }} />
        )}

        {/* ══════════ PRINTER & POS ══════════ */}
        {active === "pos" && (
          <SettingsPanel icon={Keyboard} title="POS Shortcuts" hint="Keyboard keys on the billing screen. A4 / thermal printing is set in Invoice Settings.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Complete Sale" htmlFor="scComplete">
                <select id="scComplete" value={form.shortcutCompleteSale} onChange={(e) => update("shortcutCompleteSale", e.target.value)} className={CONTROL_CLASS}>
                  {FKEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>
              <Field label="Print" htmlFor="scPrint">
                <select id="scPrint" value={form.shortcutPrint} onChange={(e) => update("shortcutPrint", e.target.value)} className={CONTROL_CLASS}>
                  {FKEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>
              <Field label="New Sale" htmlFor="scNew">
                <select id="scNew" value={form.shortcutNewSale} onChange={(e) => update("shortcutNewSale", e.target.value)} className={CONTROL_CLASS}>
                  {FKEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>
            </div>
          </SettingsPanel>
        )}

        {/* ══════════ BARCODE & ORDERS ══════════ */}
        {active === "orders" && (
          <SettingsPanel icon={Barcode} title="Barcode Label & Order ID Format">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Barcode Footer Text" htmlFor="barcodeFooterText" hint="Printed under each barcode label.">
                <input id="barcodeFooterText" value={form.barcodeFooterText} onChange={(e) => update("barcodeFooterText", e.target.value)} className={CONTROL_CLASS} />
              </Field>
              <Field label="Order ID Prefix" htmlFor="orderIdPrefix" hint="Order numbers are this prefix plus a running sequence.">
                <input id="orderIdPrefix" value={form.orderIdPrefix} onChange={(e) => update("orderIdPrefix", e.target.value.toUpperCase())} className={`${CONTROL_CLASS} uppercase`} />
              </Field>
            </div>
          </SettingsPanel>
        )}

        {/* ══════════ SOCIAL MEDIA ══════════ */}
        {active === "social" && (
          <SettingsPanel icon={Share2} title="Social Media Accounts" hint="Shown as the circular icons in the storefront footer.">
            {socialMedia.length === 0 && (
              <p className="mb-3 text-[0.8rem] text-admin-gray-400">No links yet.</p>
            )}
            {socialMedia.map((s, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <select
                  aria-label="Platform"
                  value={s.platform}
                  onChange={(e) => setSocialMedia((prev) => prev.map((row, idx) => (idx === i ? { ...row, platform: e.target.value } : row)))}
                  className={`${CONTROL_CLASS} max-w-[150px] shrink-0`}
                >
                  {Object.entries(SOCIAL_PLATFORMS).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
                <input
                  aria-label="Profile URL"
                  value={s.url}
                  onChange={(e) => setSocialMedia((prev) => prev.map((row, idx) => (idx === i ? { ...row, url: e.target.value } : row)))}
                  placeholder="https://..."
                  className={CONTROL_CLASS}
                />
                <button
                  type="button"
                  aria-label="Remove link"
                  onClick={() => setSocialMedia((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 p-1.5 text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSocialMedia((prev) => [...prev, { platform: "facebook", url: "" }])}
              className="flex items-center gap-1.5 text-[13px] font-bold uppercase text-[#9f2089]"
            >
              <Plus className="h-3.5 w-3.5" /> Add social link
            </button>
          </SettingsPanel>
        )}
        </div>
        {withPreview && <StorePreview state={previewState} showDevice={isVisible("bs-p-device")} showAudience={isVisible("bs-p-audience")} />}
        </div>
      </SettingsMenuLayout>

      {/*
        .settings-save-bar — sticky at the bottom so Save is reachable from
        every panel. One submit posts all ten panels, which is why switching
        panels must not navigate away.
      */}
      <div className="sticky bottom-0 z-[5] mt-5 flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3 font-storefront shadow-[0_-4px_16px_rgba(53,53,67,0.08)] ring-1 ring-[#eaeaf2]">
        <span className="text-[13px] text-[#8b8ba3]">{isVisible("bs-savenote") ? "Changes in every section are saved together." : ""}</span>
        <button
          type="submit"
          disabled={submitting}
          className="flex h-11 items-center gap-2 rounded-[4px] bg-[#9f2089] px-6 text-[15px] font-medium text-white hover:bg-[#861b73] disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {submitting ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </form>
  );
}
