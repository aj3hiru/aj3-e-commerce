"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Check, CircleAlert, ExternalLink, LayoutPanelTop, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { StorefrontSettingsPanels, storefrontProblem } from "@/components/admin/StorefrontSettingsPanels";
import { SettingsPanel, Field, CheckRow, CONTROL_CLASS } from "@/components/admin/SettingsMenuLayout";
import { StorePreview } from "@/components/admin/store-preview/StorePreview";
import type { StorefrontConfig } from "@/types/storefront";
import type { ShopBusinessSettings, ShopCategoryNavItem, ShopHeaderSettings } from "@/types/shop";
import { Toast } from "./ui";

const HEADER_PARTS = [
  { key: "strip", label: "Header strip" },
  { key: "headerMenu", label: "Header menu" },
  { key: "sidebarMenu", label: "Mobile sidebar" },
  { key: "menuDesign", label: "Menu design" },
  { key: "push", label: "Push bell" },
] as const;

/**
 * Customizer → Header & Menus / Footer — the one place the storefront's
 * header strip, menus, mobile sidebar, push bell and footer are edited, beside
 * a live preview that follows every change before it's saved.
 */
export function HeaderFooterCustomizer({ part, initial, initialHeader, categories, business }: {
  part: "header" | "footer"; initial: StorefrontConfig; initialHeader: ShopHeaderSettings; categories: ShopCategoryNavItem[]; business: ShopBusinessSettings;
}) {
  const [config, setConfig] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [header, setHeader] = useState(initialHeader);
  const [savedHeader, setSavedHeader] = useState(JSON.stringify(initialHeader));
  const [active, setActive] = useState<string>(part === "header" ? "strip" : "footer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const configDirty = JSON.stringify(config) !== saved;
  const headerDirty = JSON.stringify(header) !== savedHeader;
  const dirty = configDirty || headerDirty;
  const preview = useMemo(() => ({
    business, storefront: config,
    header: { ...header, deliveryTimeText: header.deliveryTimeText || business.businessHours || "" },
    drawer: active === "sidebarMenu" || active === "menuDesign",
    focus: (part === "footer" ? "footer" : "top") as "top" | "footer",
  }), [business, config, header, active, part]);
  const previewDevice = active === "headerMenu" ? "desktop" as const : active === "sidebarMenu" ? "mobile" as const : undefined;
  const problem = storefrontProblem(config);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if (problem) { setActive(problem.section); setError(problem.message); return; }
    setSaving(true); setError("");
    const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
    if (configDirty) {
      const res = await post("/api/ecommerce/storefront-config", config);
      if (!res?.success) { setSaving(false); setError(res?.message || "Couldn't save — check your connection."); return; }
      setConfig(res.config); setSaved(JSON.stringify(res.config));
    }
    if (headerDirty) {
      const res = await post("/api/ecommerce/header-settings", header);
      if (!res?.success) { setSaving(false); setError(res?.message || "Couldn't save the header strip."); return; }
      setHeader(res.header); setSavedHeader(JSON.stringify(res.header));
    }
    setSaving(false);
    setToast("Saved — live on your store now.");
  }

  const status = error
    ? <span className="inline-flex items-center gap-1.5 text-red-600"><CircleAlert className="h-3.5 w-3.5 shrink-0" />{error}</span>
    : dirty ? <span className="inline-flex items-center gap-1.5 text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Unsaved changes — preview shows them; Save to go live</span>
    : <span className="inline-flex items-center gap-1.5 text-emerald-600"><Check className="h-3.5 w-3.5" />All changes are live</span>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        {part === "header" && (
          <div className="flex flex-wrap gap-1 rounded-xl border border-admin-gray-200 bg-white p-1 shadow-sm">
            {HEADER_PARTS.map((p) => (
              <button key={p.key} type="button" onClick={() => setActive(p.key)} aria-pressed={active === p.key}
                className={cn("flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition", active === p.key ? "bg-admin-primary text-white shadow-sm" : "text-admin-gray-600 hover:bg-admin-gray-50")}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        {active === "strip"
          ? <HeaderStripPanel value={header} onChange={(v) => { setHeader(v); setError(""); }} businessHours={business.businessHours ?? ""} />
          : <StorefrontSettingsPanels active={active} value={config} onChange={(v) => { setConfig(v); setError(""); }} categories={categories} business={business} />}
        <Link href="/admin/ecommerce/business-settings" className="flex items-center gap-3 rounded-xl border border-admin-gray-200 bg-white p-4 text-sm shadow-sm hover:border-admin-primary">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-admin-primary-lighter text-admin-primary"><Building2 className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-admin-gray-800">Store name, logo, location, contacts &amp; social links</span>
            <span className="block text-xs text-admin-gray-500">These come from Business Settings.</span>
          </span>
          <ExternalLink className="h-4 w-4 text-admin-gray-400" />
        </Link>
      </div>

      <div className="order-first flex h-[80vh] flex-col gap-3 lg:order-none lg:sticky lg:top-[100px] lg:h-[calc(100vh-206px)] lg:min-h-[520px]">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-admin-gray-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="min-w-0 flex-1 basis-40 text-sm font-medium">{status}</div>
          <button type="button" onClick={save} disabled={saving || !dirty}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-admin-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-admin-primary-dark disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
          </button>
        </div>
        <StorePreview state={preview} device={previewDevice} className="h-auto min-h-0 flex-1 xl:static xl:h-auto xl:min-h-0" />
      </div>
      <Toast text={toast} />
    </div>
  );
}

/** The strip at the very top of the shop: address block, opening-time line and the search box. */
function HeaderStripPanel({ value, onChange, businessHours }: { value: ShopHeaderSettings; onChange: (v: ShopHeaderSettings) => void; businessHours: string }) {
  const set = <K extends keyof ShopHeaderSettings>(k: K, v: ShopHeaderSettings[K]) => onChange({ ...value, [k]: v });
  return (
    <SettingsPanel icon={LayoutPanelTop} title="Header strip" hint="The address block, the opening-time line and the search box at the top of your shop.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CheckRow checked={value.showLocation} onChange={(v) => set("showLocation", v)}>Show address block</CheckRow>
        <CheckRow checked={value.showDeliveryInfo} onChange={(v) => set("showDeliveryInfo", v)}>Show delivery / opening time</CheckRow>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Status label" htmlFor="hsLabel" hint="The green line above the clock, e.g. “We're open”.">
          <input id="hsLabel" value={value.deliveryLabel} onChange={(e) => set("deliveryLabel", e.target.value)} placeholder="We're open" className={CONTROL_CLASS} />
        </Field>
        <Field label="Delivery time text" htmlFor="hsTime" hint={businessHours ? `Blank = your business hours (${businessHours}).` : "Blank = your business hours."}>
          <input id="hsTime" value={value.deliveryTimeText} onChange={(e) => set("deliveryTimeText", e.target.value)} placeholder={businessHours || "e.g. 9 AM - 9 PM"} className={CONTROL_CLASS} />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Search box placeholder" htmlFor="hsSearch">
          <input id="hsSearch" value={value.searchPlaceholder} onChange={(e) => set("searchPlaceholder", e.target.value)} placeholder="Search for products" className={CONTROL_CLASS} />
        </Field>
      </div>
      <p className="mt-3 rounded-[6px] bg-[#f8f9fe] px-3 py-2 text-[12.5px] text-[#616173]">The address block needs a Location in Business Settings → Business Identity.</p>
    </SettingsPanel>
  );
}
