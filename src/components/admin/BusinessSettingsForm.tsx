"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ImagePlus } from "lucide-react";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";

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
}

const FKEYS = Array.from({ length: 11 }, (_, i) => `F${i + 2}`);

export function BusinessSettingsForm({ initial }: { initial: BusinessSettingsInitial }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [contactNumbers, setContactNumbers] = useState(initial.contactNumbers.length ? initial.contactNumbers : [""]);
  const [invoiceNumbers, setInvoiceNumbers] = useState<string[]>(initial.invoiceNumbers);
  const [socialMedia, setSocialMedia] = useState(initial.socialMedia.length ? initial.socialMedia : []);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">{error}</div>}

      {/* Profile */}
      <section className="bg-white rounded-lg border border-admin-gray-200 p-5">
        <h5 className="font-bold mb-4">Business Profile</h5>
        <label htmlFor="bizLogo" className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-admin-gray-300 rounded-lg h-28 cursor-pointer overflow-hidden mb-3">
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="" className="h-full object-contain" />
          ) : (
            <>
              <ImagePlus className="w-6 h-6 text-admin-gray-400" />
              <span className="text-xs text-admin-gray-400">Upload logo</span>
            </>
          )}
        </label>
        <input type="file" id="bizLogo" accept="image/*" className="hidden" onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)} />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">Business Name *</label>
            <input required value={form.businessName} onChange={(e) => update("businessName", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tagline</label>
            <input value={form.tagline} onChange={(e) => update("tagline", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium mb-1">SEO Description</label>
          <textarea rows={2} value={form.seoDescription} onChange={(e) => update("seoDescription", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Website URL</label>
            <input value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Location</label>
            <input value={form.location} onChange={(e) => update("location", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Business Hours</label>
            <input value={form.businessHours} onChange={(e) => update("businessHours", e.target.value)} placeholder="e.g. 9 AM - 9 PM" className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium mb-1">Address</label>
          <textarea rows={2} value={form.address} onChange={(e) => update("address", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>
      </section>

      {/* Contact Numbers */}
      <section className="bg-white rounded-lg border border-admin-gray-200 p-5">
        <h5 className="font-bold mb-3">Contact Numbers</h5>
        {contactNumbers.map((num, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input
              value={num}
              onChange={(e) => setContactNumbers((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
              className="flex-1 border border-admin-gray-200 rounded px-3 py-2 text-sm"
              placeholder="Phone number"
            />
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={invoiceNumbers.includes(num)}
                onChange={(e) =>
                  setInvoiceNumbers((prev) => (e.target.checked ? [...prev, num] : prev.filter((n) => n !== num)))
                }
              />
              On invoice
            </label>
            <button type="button" onClick={() => setContactNumbers((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 p-1.5">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setContactNumbers((prev) => [...prev, ""])} className="flex items-center gap-1.5 text-xs text-admin-primary font-medium">
          <Plus className="w-3.5 h-3.5" /> Add number
        </button>
      </section>

      {/* Tax / Legal */}
      <section className="bg-white rounded-lg border border-admin-gray-200 p-5">
        <h5 className="font-bold mb-3">Tax &amp; Legal Details</h5>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">GSTIN</label>
            <input value={form.gstin} onChange={(e) => update("gstin", e.target.value.toUpperCase())} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm uppercase" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">PAN Number</label>
            <input value={form.panNumber} onChange={(e) => update("panNumber", e.target.value.toUpperCase())} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm uppercase" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">FSSAI Number</label>
            <input value={form.fssaiNumber} onChange={(e) => update("fssaiNumber", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">State</label>
            <input value={form.state} onChange={(e) => update("state", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.showGstinOnInvoice} onChange={(e) => update("showGstinOnInvoice", e.target.checked)} /> Show GSTIN on invoice</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.showPanOnInvoice} onChange={(e) => update("showPanOnInvoice", e.target.checked)} /> Show PAN on invoice</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.showFssaiOnInvoice} onChange={(e) => update("showFssaiOnInvoice", e.target.checked)} /> Show FSSAI on invoice</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.showAddressOnInvoice} onChange={(e) => update("showAddressOnInvoice", e.target.checked)} /> Show address on invoice</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.showLocationOnInvoice} onChange={(e) => update("showLocationOnInvoice", e.target.checked)} /> Show location on invoice</label>
        </div>
      </section>

      {/* Invoice / Display */}
      <section className="bg-white rounded-lg border border-admin-gray-200 p-5">
        <h5 className="font-bold mb-3">Invoice &amp; Display</h5>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">Site Header Display</label>
            <select value={form.siteHeaderDisplay} onChange={(e) => update("siteHeaderDisplay", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="title">Title only</option>
              <option value="logo">Logo only</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Invoice Display</label>
            <select value={form.invoiceDisplay} onChange={(e) => update("invoiceDisplay", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="logo">Logo only</option>
              <option value="name">Name only</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Invoice Title</label>
            <input value={form.invoiceTitle} onChange={(e) => update("invoiceTitle", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Order ID Prefix</label>
            <input value={form.orderIdPrefix} onChange={(e) => update("orderIdPrefix", e.target.value.toUpperCase())} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm uppercase" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Printer Format</label>
            <select value={form.printerFormat} onChange={(e) => update("printerFormat", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="a4">A4</option>
              <option value="thermal_58">Thermal 58mm</option>
              <option value="thermal_80">Thermal 80mm</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Logo Display Width (px)</label>
            <input type="number" min={40} max={400} value={form.logoDisplayWidth} onChange={(e) => update("logoDisplayWidth", Math.max(40, Math.min(400, Number(e.target.value))))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium mb-1">Invoice Footer Note</label>
          <textarea rows={2} value={form.invoiceFooterNote} onChange={(e) => update("invoiceFooterNote", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Return Policy</label>
          <textarea rows={2} value={form.returnPolicy} onChange={(e) => update("returnPolicy", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>
      </section>

      {/* POS / Billing */}
      <section className="bg-white rounded-lg border border-admin-gray-200 p-5">
        <h5 className="font-bold mb-3">POS &amp; Billing</h5>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1">POS Print Mode</label>
            <select value={form.posPrintMode} onChange={(e) => update("posPrintMode", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="thermal">Thermal only</option>
              <option value="a4">A4 only</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Barcode Footer Text</label>
            <input value={form.barcodeFooterText} onChange={(e) => update("barcodeFooterText", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Complete Sale Shortcut</label>
            <select value={form.shortcutCompleteSale} onChange={(e) => update("shortcutCompleteSale", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              {FKEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Print Shortcut</label>
            <select value={form.shortcutPrint} onChange={(e) => update("shortcutPrint", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              {FKEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">New Sale Shortcut</label>
            <select value={form.shortcutNewSale} onChange={(e) => update("shortcutNewSale", e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              {FKEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Social Media */}
      <section className="bg-white rounded-lg border border-admin-gray-200 p-5">
        <h5 className="font-bold mb-3">Social Media Links</h5>
        {socialMedia.map((s, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <select
              value={s.platform}
              onChange={(e) => setSocialMedia((prev) => prev.map((row, idx) => (idx === i ? { ...row, platform: e.target.value } : row)))}
              className="max-w-[150px] shrink-0 border border-admin-gray-200 rounded px-2 py-2 text-sm"
            >
              {Object.entries(SOCIAL_PLATFORMS).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <input
              value={s.url}
              onChange={(e) => setSocialMedia((prev) => prev.map((row, idx) => (idx === i ? { ...row, url: e.target.value } : row)))}
              placeholder="https://..."
              className="flex-1 border border-admin-gray-200 rounded px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => setSocialMedia((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 p-1.5">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSocialMedia((prev) => [...prev, { platform: "facebook", url: "" }])}
          className="flex items-center gap-1.5 text-xs text-admin-primary font-medium"
        >
          <Plus className="w-3.5 h-3.5" /> Add social link
        </button>
      </section>

      <button
        type="submit"
        disabled={submitting}
        className="bg-admin-primary hover:bg-admin-primary-dark text-white font-semibold rounded-lg px-6 py-3 disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Save Business Settings"}
      </button>
    </form>
  );
}
