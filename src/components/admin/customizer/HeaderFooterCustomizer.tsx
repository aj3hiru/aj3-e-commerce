"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Check, CircleAlert, ExternalLink, Loader2, Monitor, RefreshCw, Save, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { StorefrontSettingsPanels, storefrontProblem } from "@/components/admin/StorefrontSettingsPanels";
import type { StorefrontConfig } from "@/types/storefront";
import type { ShopBusinessSettings, ShopCategoryNavItem } from "@/types/shop";
import { Preview, Toast } from "./ui";

const HEADER_PARTS = [
  { key: "headerMenu", label: "Header menu" },
  { key: "sidebarMenu", label: "Mobile sidebar" },
  { key: "menuDesign", label: "Menu design" },
  { key: "push", label: "Push bell" },
] as const;

/**
 * Customizer → Header / Footer. Same editors as Business Settings (they share
 * one saved config), beside a live preview of the storefront. Menus and the
 * footer apply as soon as they're saved — there is no draft for them.
 */
export function HeaderFooterCustomizer({ part, initial, categories, business }: {
  part: "header" | "footer"; initial: StorefrontConfig; categories: ShopCategoryNavItem[]; business: ShopBusinessSettings;
}) {
  const [config, setConfig] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [active, setActive] = useState<string>(part === "header" ? "headerMenu" : "footer");
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const dirty = JSON.stringify(config) !== saved;
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
    const res = await fetch("/api/ecommerce/storefront-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) })
      .then((r) => r.json()).catch(() => null);
    setSaving(false);
    if (!res?.success) { setError(res?.message || "Couldn't save — check your connection."); return; }
    setConfig(res.config); setSaved(JSON.stringify(res.config));
    setVersion((v) => v + 1);
    setToast("Saved — live on your store now.");
  }

  const status = error
    ? <span className="inline-flex items-center gap-1.5 text-red-600"><CircleAlert className="h-3.5 w-3.5 shrink-0" />{error}</span>
    : dirty ? <span className="inline-flex items-center gap-1.5 text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Unsaved changes — Save to update the preview</span>
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
        <StorefrontSettingsPanels active={active} value={config} onChange={(v) => { setConfig(v); setError(""); }} categories={categories} business={business} />
        <Link href="/admin/ecommerce/business-settings" className="flex items-center gap-3 rounded-xl border border-admin-gray-200 bg-white p-4 text-sm shadow-sm hover:border-admin-primary">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-admin-primary-lighter text-admin-primary"><Building2 className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-admin-gray-800">Store name, logo, contacts &amp; {part === "header" ? "header strip (location, opening time)" : "social links"}</span>
            <span className="block text-xs text-admin-gray-500">These come from Business Settings.</span>
          </span>
          <ExternalLink className="h-4 w-4 text-admin-gray-400" />
        </Link>
      </div>

      <div className="order-first flex h-[80vh] flex-col gap-3 lg:order-none lg:sticky lg:top-[100px] lg:h-[calc(100vh-116px)]">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-admin-gray-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="min-w-0 flex-1 basis-40 text-sm font-medium">{status}</div>
          <div className="flex rounded-lg bg-admin-gray-100 p-1">
            {([["mobile", Smartphone, "Mobile"], ["desktop", Monitor, "Desktop"]] as const).map(([d, Icon, l]) => (
              <button key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold", device === d ? "bg-white text-admin-primary shadow-sm" : "text-admin-gray-500")}>
                <Icon className="h-3.5 w-3.5" />{l}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setVersion((v) => v + 1)} title="Reload preview" aria-label="Reload preview"
            className="grid h-9 w-9 place-items-center rounded-lg border border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50"><RefreshCw className="h-4 w-4" /></button>
          <button type="button" onClick={save} disabled={saving || !dirty}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-admin-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-admin-primary-dark disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
          </button>
        </div>
        <div className="min-h-0 flex-1"><Preview url={part === "footer" ? "/shop?hc=footer" : "/shop?hc=header"} version={version} device={device} focus={null} anchor={part === "footer" ? "footer" : undefined} /></div>
      </div>
      <Toast text={toast} />
    </div>
  );
}
