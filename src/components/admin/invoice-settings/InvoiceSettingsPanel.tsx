"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check, FileText, Hash, Heading, IdCard, MapPin, MessageSquareText, Palette, Plus, Printer, ReceiptText, RotateCcw, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InvoiceData } from "@/lib/invoice-data";
import {
  THERMAL_TEMPLATES, resolveSeller,
  type InvoiceField, type InvoiceProfile, type InvoiceSettings, type PrintChoice,
} from "@/types/invoice-settings";
import { A4InvoiceSheet } from "@/components/invoice/A4InvoiceSheet";
import { ThermalReceipt } from "@/components/invoice/ThermalReceipt";
import { CONTROL_CLASS, CheckRow, Field, SettingsPanel } from "../SettingsMenuLayout";

const SAMPLE: InvoiceData = (() => {
  const items = [
    { productName: "Cotton Kurta Set (M)", hsnCode: "6204", qty: 2, price: 499, gstRate: 5 },
    { productName: "Basmati Rice 5 kg", hsnCode: "1006", qty: 1, price: 640, gstRate: 5 },
    { productName: "Steel Water Bottle", hsnCode: "7323", qty: 3, price: 180, gstRate: 18 },
  ];
  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  const discount = 50;
  const totalGst = items.reduce((n, i) => n + (i.price * i.qty * i.gstRate) / 100, 0);
  const grandTotal = Math.round((subtotal - discount + totalGst) * 100) / 100;
  return {
    order: {
      id: 0, orderNumber: "ORD0001234", customerName: "Priya Sharma", customerEmail: "priya@example.com", orderType: "offline",
      paymentStatus: "Paid", orderStatus: "Delivered", paymentMethod: "Cash", createdAt: new Date("2026-09-25T10:45:00+05:30"),
      shippingAddress: "12, Gandhi Nagar, Near Bus Stand\nPatna, Bihar 800001", mapUrl: null,
    },
    customer: { name: "Priya Sharma", email: "priya@example.com", phone: "98765 43210", address: null },
    items, itemCount: items.length, totalQty: items.reduce((n, i) => n + i.qty, 0),
    subtotal, discount, totalGst, cgst: totalGst / 2, sgst: totalGst / 2, grandTotal, paidAmount: grandTotal, dueAmount: 0, isFullyPaid: true,
    paymentBreakdown: [{ paymentMethod: "Cash", total: grandTotal }], duePaymentHistory: [], linkedCreditAmount: null,
  };
})();

const PRINT_CHOICES: { id: PrintChoice; label: string; blurb: string; icon: typeof FileText }[] = [
  { id: "a4", label: "A4 Invoice", blurb: "Full tax invoice", icon: FileText },
  { id: "thermal", label: "Thermal Print", blurb: "Till slip (58 / 80 mm)", icon: ReceiptText },
  { id: "ask", label: "Ask every time", blurb: "Choose on each print", icon: Printer },
];
const ACCENTS = ["#9f2089", "#1f2937", "#1d4ed8", "#047857", "#b91c1c", "#c2410c"];

/**
 * Business Settings → Invoice Settings: what an invoice prints and how, with
 * a live A4 / thermal preview that follows every tick and keystroke.
 */
export function InvoiceSettingsPanel({ value, onChange, profile }: { value: InvoiceSettings; onChange: (v: InvoiceSettings) => void; profile: InvoiceProfile }) {
  const [view, setView] = useState<"a4" | "thermal">(value.defaultPrint === "thermal" ? "thermal" : "a4");
  const set = <K extends keyof InvoiceSettings>(k: K, v: InvoiceSettings[K]) => onChange({ ...value, [k]: v });
  const setField = (k: "address" | "location" | "phones" | "email" | "gstin" | "pan" | "fssai", patch: Partial<InvoiceField>) => set(k, { ...value[k], ...patch });
  const seller = useMemo(() => resolveSeller(value, profile), [value, profile]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <SettingsPanel icon={Printer} title="When an invoice is generated" hint="What opens after a bill is completed and from the Print buttons on orders.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PRINT_CHOICES.map((c) => (
              <button key={c.id} type="button" onClick={() => { set("defaultPrint", c.id); if (c.id !== "ask") setView(c.id); }}
                className={cn("flex items-center gap-3 rounded-[8px] border-2 px-3 py-3 text-left transition", value.defaultPrint === c.id ? "border-[#9f2089] bg-[#fdf0f9]" : "border-[#eaeaf2] hover:border-[#cfcedc]")}>
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", value.defaultPrint === c.id ? "bg-[#9f2089] text-white" : "bg-[#f3f3f7] text-[#616173]")}><c.icon className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block text-[14px] font-semibold">{c.label}</span><span className="block text-[12px] text-[#8b8ba3]">{c.blurb}</span></span>
              </button>
            ))}
          </div>
          <div className="mt-3"><CheckRow checked={value.autoPrint} onChange={(v) => set("autoPrint", v)}>Open the print dialog straight away</CheckRow></div>
        </SettingsPanel>

        <div onFocusCapture={() => setView("thermal")} onClickCapture={() => setView("thermal")}>
          <SettingsPanel icon={ReceiptText} title="Thermal receipt" hint="Pick a template — every option below applies to it and the preview shows it live.">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {THERMAL_TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => set("thermalTemplate", t.id)}
                  className={cn("relative rounded-[8px] border-2 px-3 py-2.5 text-left transition", value.thermalTemplate === t.id ? "border-[#9f2089] bg-[#fdf0f9]" : "border-[#eaeaf2] hover:border-[#cfcedc]")}>
                  {value.thermalTemplate === t.id && <Check className="absolute right-2 top-2 h-4 w-4 text-[#9f2089]" strokeWidth={3} />}
                  <span className="block text-[14px] font-semibold">{t.name}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-[#8b8ba3]">{t.blurb}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Paper width"><Segmented value={value.thermalWidth} options={[["58mm", "58 mm"], ["80mm", "80 mm"]]} onChange={(v) => set("thermalWidth", v)} /></Field>
              <Field label="Text size"><Segmented value={value.thermalFont} options={[["sm", "Small"], ["md", "Normal"], ["lg", "Large"]]} onChange={(v) => set("thermalFont", v)} /></Field>
            </div>
          </SettingsPanel>
        </div>

        <div onFocusCapture={() => setView("a4")} onClickCapture={() => setView("a4")}>
          <SettingsPanel icon={Palette} title="A4 invoice" hint="Colour, signature, terms and the amount in words.">
            <Field label="Invoice colour">
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((c) => (
                  <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => set("accent", c)} style={{ background: c }}
                    className={cn("grid h-9 w-9 place-items-center rounded-full ring-offset-2 transition", value.accent.toLowerCase() === c ? "ring-2 ring-[#353543]" : "")}>
                    {value.accent.toLowerCase() === c && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                  </button>
                ))}
                <label className="flex h-9 items-center gap-2 rounded-full border border-[#dcdce6] pl-1 pr-3 text-[13px] text-[#616173]">
                  <input type="color" value={value.accent} onChange={(e) => set("accent", e.target.value)} className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0" />Custom
                </label>
              </div>
            </Field>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CheckRow checked={value.showAmountInWords} onChange={(v) => set("showAmountInWords", v)}>Amount in words</CheckRow>
              <CheckRow checked={value.showSignature} onChange={(v) => set("showSignature", v)}>Signature box</CheckRow>
            </div>
            {value.showSignature && (
              <div className="mt-3"><Field label="Signature label" htmlFor="invSig"><input id="invSig" value={value.signatureLabel} onChange={(e) => set("signatureLabel", e.target.value)} className={CONTROL_CLASS} /></Field></div>
            )}
            <div className="mt-3">
              <Field label="Terms & conditions" htmlFor="invTerms" hint="Printed at the bottom of the A4 invoice. Leave empty to hide.">
                <textarea id="invTerms" rows={3} value={value.terms} onChange={(e) => set("terms", e.target.value)} placeholder="e.g. Goods once sold will not be taken back. Subject to Patna jurisdiction." className={CONTROL_CLASS} />
              </Field>
            </div>
          </SettingsPanel>
        </div>

        <SettingsPanel icon={Heading} title="Invoice header">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CheckRow checked={value.showName} onChange={(v) => set("showName", v)}>Business name</CheckRow>
            <CheckRow checked={value.showLogo} onChange={(v) => set("showLogo", v)}>Logo</CheckRow>
            <CheckRow checked={value.showTagline} onChange={(v) => set("showTagline", v)}>Tagline</CheckRow>
          </div>
          {value.showLogo && !profile.logo && <p className="mt-2 text-[12.5px] text-[#c77700]">No logo uploaded yet — add one in Logo &amp; Branding.</p>}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Invoice title" htmlFor="invTitle"><input id="invTitle" value={value.title} onChange={(e) => set("title", e.target.value)} placeholder="Tax Invoice" className={CONTROL_CLASS} /></Field>
            {value.showLogo && (
              <Field label={`Logo width — ${value.logoWidth}px`} htmlFor="invLogoW">
                <input id="invLogoW" type="range" min={40} max={220} step={5} value={value.logoWidth} onChange={(e) => set("logoWidth", Number(e.target.value))} className="mt-3 w-full accent-[#9f2089]" />
              </Field>
            )}
          </div>
        </SettingsPanel>

        <SettingsPanel icon={Hash} title="Invoice details" hint="Tick what to print.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <CheckRow checked={value.showInvoiceNo} onChange={(v) => set("showInvoiceNo", v)}>Invoice No.</CheckRow>
            <CheckRow checked={value.showDate} onChange={(v) => set("showDate", v)}>Date</CheckRow>
            <CheckRow checked={value.showTime} onChange={(v) => set("showTime", v)}>Time</CheckRow>
            <CheckRow checked={value.showCustomer} onChange={(v) => set("showCustomer", v)}>Customer</CheckRow>
            <CheckRow checked={value.showPaymentMode} onChange={(v) => set("showPaymentMode", v)}>Payment mode</CheckRow>
            <CheckRow checked={value.showBarcode} onChange={(v) => set("showBarcode", v)}>Barcode</CheckRow>
            <CheckRow checked={value.showHsn} onChange={(v) => set("showHsn", v)}>HSN code</CheckRow>
            <CheckRow checked={value.showTaxBreakup} onChange={(v) => set("showTaxBreakup", v)}>GST summary</CheckRow>
          </div>
        </SettingsPanel>

        <SettingsPanel icon={MapPin} title="Business details" hint="Filled from your business profile. Type here to print something different on invoices only.">
          <div className="space-y-3">
            <ProfileField label="Address" f={value.address} fallback={profile.address} multiline onChange={(p) => setField("address", p)} />
            <ProfileField label="Location" f={value.location} fallback={profile.location} onChange={(p) => setField("location", p)} />
            <ProfileField label="Contact number(s)" f={value.phones} fallback={profile.phones.join(", ")} onChange={(p) => setField("phones", p)} hint="Separate numbers with commas." />
            <ProfileField label="Email" f={value.email} fallback={profile.email} onChange={(p) => setField("email", p)} />
          </div>
        </SettingsPanel>

        <SettingsPanel icon={IdCard} title="GST / Tax details" hint="From Tax & Legal when filled there — or type them here.">
          <div className="space-y-3">
            <ProfileField label="GSTIN" f={value.gstin} fallback={profile.gstin} upper onChange={(p) => setField("gstin", p)} />
            <ProfileField label="PAN" f={value.pan} fallback={profile.pan} upper onChange={(p) => setField("pan", p)} />
            <ProfileField label="FSSAI Lic. No." f={value.fssai} fallback={profile.fssai} onChange={(p) => setField("fssai", p)} />
            {value.extraIds.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="checkbox" checked={x.show} aria-label="Print" onChange={(e) => set("extraIds", value.extraIds.map((y, j) => (j === i ? { ...y, show: e.target.checked } : y)))} className="h-[18px] w-[18px] shrink-0 accent-[#9f2089]" />
                <input value={x.label} onChange={(e) => set("extraIds", value.extraIds.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} placeholder="Label (e.g. Udyam / SSI)" className={cn(CONTROL_CLASS, "max-w-[190px]")} />
                <input value={x.value} onChange={(e) => set("extraIds", value.extraIds.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} placeholder="Number" className={CONTROL_CLASS} />
                <button type="button" aria-label="Remove" onClick={() => set("extraIds", value.extraIds.filter((_, j) => j !== i))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#d0263a] hover:bg-[#fdecee]"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {value.extraIds.length < 6 && (
              <button type="button" onClick={() => set("extraIds", [...value.extraIds, { label: "", value: "", show: true }])} className="flex items-center gap-1.5 text-[13px] font-bold uppercase text-[#9f2089]">
                <Plus className="h-3.5 w-3.5" />Add another ID (SSI, Udyam, CIN…)
              </button>
            )}
          </div>
        </SettingsPanel>

        <SettingsPanel icon={MessageSquareText} title="Footer">
          <Field label="Thank-you message" htmlFor="invFooter" hint="Printed at the bottom of both A4 and thermal invoices.">
            <textarea id="invFooter" rows={2} value={value.footerNote} onChange={(e) => set("footerNote", e.target.value)} placeholder="Thank you, visit again!" className={CONTROL_CLASS} />
          </Field>
        </SettingsPanel>
      </div>

      {/* Live preview */}
      <div className="xl:sticky xl:top-4">
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#eaeaf2]">
          <div className="flex items-center justify-between gap-2 border-b border-[#f0f0f5] px-4 py-3">
            <p className="text-[15px] font-semibold">Live preview</p>
            <Segmented value={view} options={[["a4", "A4"], ["thermal", "Thermal"]]} onChange={setView} />
          </div>
          <div className="max-h-[calc(100vh-140px)] overflow-auto bg-[#e9e9f0] p-4">
            {view === "a4"
              ? <Scaled width={794}><A4InvoiceSheet data={SAMPLE} s={value} seller={seller} /></Scaled>
              : <div className="mx-auto w-fit shadow-[0_6px_20px_rgba(0,0,0,0.12)]"><ThermalReceipt data={SAMPLE} s={value} seller={seller} /></div>}
          </div>
          <p className="border-t border-[#f0f0f5] px-4 py-2 text-[12px] text-[#8b8ba3]">Sample bill — your real invoices use the same layout.</p>
        </section>
      </div>
    </div>
  );
}

/** Shrinks a fixed-width page (the 794 px A4 sheet) to fit the preview column. */
function Scaled({ width, children }: { width: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      const k = Math.min(1, box.current.clientWidth / width);
      setScale(k); setHeight(inner.current.offsetHeight * k);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={box} style={{ height }} className="relative">
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: "top left" }} className="absolute left-0 top-0 shadow-[0_6px_20px_rgba(0,0,0,0.12)]">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-[6px] bg-[#f3f3f7] p-1 text-[13px] font-semibold">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={cn("h-8 rounded-[4px] px-3 transition", value === v ? "bg-white text-[#9f2089] shadow-sm" : "text-[#616173]")}>{label}</button>
      ))}
    </div>
  );
}

/** A detail that comes from the business profile, can be switched off, or overridden for invoices only. */
function ProfileField({ label, f, fallback, onChange, multiline, upper, hint }: {
  label: string; f: InvoiceField; fallback: string; onChange: (p: Partial<InvoiceField>) => void; multiline?: boolean; upper?: boolean; hint?: string;
}) {
  const custom = f.value.trim() !== "";
  const Input = multiline ? "textarea" : "input";
  return (
    <div className={cn("rounded-[8px] border px-3 py-2.5 transition", f.show ? "border-[#dcdce6]" : "border-dashed border-[#dcdce6] bg-[#fafafc]")}>
      <div className="flex items-center gap-2">
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-[14px] font-medium">
          <input type="checkbox" checked={f.show} onChange={(e) => onChange({ show: e.target.checked })} className="h-[18px] w-[18px] accent-[#9f2089]" />
          Show {label}
        </label>
        {custom
          ? <button type="button" onClick={() => onChange({ value: "" })} className="flex items-center gap-1 text-[12px] font-semibold text-[#9f2089]"><RotateCcw className="h-3.5 w-3.5" />Use profile</button>
          : <span className="text-[11.5px] text-[#8b8ba3]">{fallback.trim() ? "From business profile" : "Not in profile"}</span>}
      </div>
      {f.show && (
        <Input value={custom ? f.value : fallback} rows={multiline ? 2 : undefined} placeholder={`Type ${label.toLowerCase()}`}
          onChange={(e) => { const v = upper ? e.target.value.toUpperCase() : e.target.value; onChange({ value: v === fallback ? "" : v }); }}
          className={cn(CONTROL_CLASS, "mt-2", upper && "uppercase placeholder:normal-case")} />
      )}
      {f.show && hint && <p className="mt-1 text-[12px] text-[#8b8ba3]">{hint}</p>}
    </div>
  );
}
