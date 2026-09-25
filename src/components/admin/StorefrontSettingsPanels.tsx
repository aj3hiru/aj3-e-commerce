"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowDown, ArrowUp, Bell, ChevronDown, Eye, EyeOff, ExternalLink, LayoutPanelTop, ListTree, Menu as MenuIcon2,
  Palette, PanelBottom, Plus, RotateCcw, Smartphone, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LaptopFrame, PhoneFrame } from "./PhoneFrame";
import { SettingsPanel, Field, CheckRow, CONTROL_CLASS } from "./SettingsMenuLayout";
import { MENU_ICON, SidebarMenu, DesktopMenu, resolveMenu } from "@/components/shop/menu/StoreMenus";
import { ShopFooter } from "@/components/shop/ShopFooter";
import {
  DEFAULT_FOOTER, DEFAULT_HEADER_MENU, DEFAULT_MENU_DESIGN, DEFAULT_SIDEBAR_MENU, LINK_PRESETS, MENU_ICONS, isSafeHref,
  type FooterColumn, type MenuIcon, type MenuItem, type StorefrontConfig,
} from "@/types/storefront";
import type { ShopBusinessSettings, ShopCategoryNavItem } from "@/types/shop";

export const STOREFRONT_SECTIONS = ["headerMenu", "sidebarMenu", "menuDesign", "push", "footer"] as const;
export const STOREFRONT_MENU = [
  { key: "headerMenu", label: "Header Menu", icon: LayoutPanelTop },
  { key: "sidebarMenu", label: "Sidebar Menu (Mobile)", icon: MenuIcon2 },
  { key: "menuDesign", label: "Menu Design", icon: Palette },
  { key: "push", label: "Push Notifications", icon: Bell },
  { key: "footer", label: "Footer", icon: PanelBottom },
];

const newId = () => Math.random().toString(36).slice(2, 10);

/** First problem in the config (a row missing its label or with an unsafe link), for a clear message before saving. */
export function storefrontProblem(c: StorefrontConfig): { section: string; message: string } | null {
  for (const [section, items] of [["headerMenu", c.headerMenu], ["sidebarMenu", c.sidebarMenu]] as const) {
    for (const it of items) {
      if (!it.label.trim()) return { section, message: "Every menu item needs a label." };
      if (!it.autoCategories && !isSafeHref(it.href)) return { section, message: `"${it.label}" has an invalid link.` };
      for (const ch of it.children) {
        if (!ch.label.trim() || !isSafeHref(ch.href)) return { section, message: `A dropdown link under "${it.label}" needs a label and a valid link.` };
      }
    }
  }
  for (const col of c.footer.columns) for (const l of col.links) {
    if (!l.label.trim() || !isSafeHref(l.href)) return { section: "footer", message: `A link in the footer column "${col.title || "Untitled"}" needs a label and a valid link.` };
  }
  if (c.footer.ctaButtonUrl && !isSafeHref(c.footer.ctaButtonUrl)) return { section: "footer", message: "The Follow Us button link is invalid." };
  return null;
}

/* ───────────────────────── link picker ───────────────────────── */

function LinkPicker({ value, onChange, categories, id }: { value: string; onChange: (href: string) => void; categories: ShopCategoryNavItem[]; id?: string }) {
  const options = useMemo(() => [
    ...LINK_PRESETS.map((p) => ({ label: p.label, href: p.href })),
    ...categories.map((c) => ({ label: `Category: ${c.name}`, href: `/category?slug=${encodeURIComponent(c.slug)}` })),
  ], [categories]);
  const known = options.some((o) => o.href === value);
  const [custom, setCustom] = useState(!known && value !== "");
  const bad = value !== "" && !isSafeHref(value);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <select id={id} value={custom ? "__custom" : value} className={CONTROL_CLASS}
        onChange={(e) => { if (e.target.value === "__custom") { setCustom(true); } else { setCustom(false); onChange(e.target.value); } }}>
        {!known && !custom && <option value="">Choose a page…</option>}
        <optgroup label="Pages">{LINK_PRESETS.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}</optgroup>
        {categories.length > 0 && <optgroup label="Categories">{categories.map((c) => { const h = `/category?slug=${encodeURIComponent(c.slug)}`; return <option key={h} value={h}>{c.name}</option>; })}</optgroup>}
        <option value="__custom">Custom link…</option>
      </select>
      {custom && (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="/page, https://…, tel:…, mailto:…"
          className={cn(CONTROL_CLASS, bad && "border-red-400")} aria-invalid={bad} />
      )}
      {bad && <span className="text-[11px] text-red-600">Use a site path (/…), https:// link, tel: or mailto:</span>}
    </div>
  );
}

/* ───────────────────────── menu builder ───────────────────────── */

function IconSelect({ value, onChange }: { value: MenuIcon; onChange: (v: MenuIcon) => void }) {
  const Icon = MENU_ICON[value];
  return (
    <div className="relative w-[124px] shrink-0">
      <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9f2089]" />
      <select aria-label="Icon" value={value} onChange={(e) => onChange(e.target.value as MenuIcon)} className={cn(CONTROL_CLASS, "pl-8")}>
        {MENU_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
    </div>
  );
}

function MenuBuilder({ items, onChange, categories, defaults }: {
  items: MenuItem[]; onChange: (next: MenuItem[]) => void; categories: ShopCategoryNavItem[]; defaults: MenuItem[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (i: number, patch: Partial<MenuItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) => { const n = [...items]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n); };

  return (
    <div className="space-y-2.5">
      {items.length === 0 && <p className="rounded-md border border-dashed border-admin-gray-300 px-3 py-6 text-center text-sm text-admin-gray-500">No menu items — add one below.</p>}
      {items.map((it, i) => (
        <div key={it.id} className={cn("rounded-lg border bg-white", it.enabled ? "border-admin-gray-200" : "border-dashed border-admin-gray-300 opacity-70")}>
          <div className="flex flex-wrap items-start gap-2 p-2.5">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-0.5 text-admin-gray-500 hover:bg-admin-gray-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="rounded p-0.5 text-admin-gray-500 hover:bg-admin-gray-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
            <IconSelect value={it.icon} onChange={(icon) => set(i, { icon })} />
            <input aria-label="Label" value={it.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} placeholder="Label"
              className={cn(CONTROL_CLASS, "w-[150px] min-w-[120px] flex-1 sm:flex-none", !it.label.trim() && "border-red-400")} />
            {it.autoCategories
              ? <span className="flex min-w-[160px] flex-1 items-center rounded border border-admin-gray-200 bg-admin-gray-50 px-3 py-2 text-sm text-admin-gray-500">Opens all categories</span>
              : <LinkPicker value={it.href} onChange={(href) => set(i, { href })} categories={categories} />}
            <select aria-label="Who sees this" value={it.visibility} onChange={(e) => set(i, { visibility: e.target.value as MenuItem["visibility"] })} className={cn(CONTROL_CLASS, "w-[130px]")}>
              <option value="all">Everyone</option><option value="guest">Logged-out only</option><option value="user">Logged-in only</option>
            </select>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => set(i, { enabled: !it.enabled })} title={it.enabled ? "Hide" : "Show"} aria-label={it.enabled ? "Hide item" : "Show item"}
                className="rounded p-1.5 text-admin-gray-500 hover:bg-admin-gray-100">{it.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
              <button type="button" onClick={() => setOpen(open === it.id ? null : it.id)} aria-expanded={open === it.id} title="Dropdown & options"
                className={cn("flex items-center gap-1 rounded px-2 py-1.5 text-xs font-semibold", open === it.id ? "bg-[#f7d9ef] text-[#9f2089]" : "text-admin-gray-600 hover:bg-admin-gray-100")}>
                <ListTree className="h-4 w-4" />{(it.children.length > 0 || it.autoCategories) && <span>{it.autoCategories ? "All" : it.children.length}</span>}
                <ChevronDown className={cn("h-3 w-3 transition-transform", open === it.id && "rotate-180")} />
              </button>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Delete item" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          {open === it.id && (
            <div className="space-y-2.5 border-t border-admin-gray-100 bg-admin-gray-50/60 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckRow checked={it.autoCategories} onChange={(v) => set(i, { autoCategories: v })}>Dropdown lists all categories automatically</CheckRow>
                <CheckRow checked={it.newTab} onChange={(v) => set(i, { newTab: v })}>Open in a new tab</CheckRow>
              </div>
              <p className="text-xs font-semibold text-admin-gray-600">{it.autoCategories ? "Extra dropdown links (shown after the categories)" : "Dropdown links"}</p>
              {it.children.map((c, ci) => (
                <div key={c.id} className="flex flex-wrap items-start gap-2">
                  <input aria-label="Dropdown label" value={c.label} maxLength={40} placeholder="Label"
                    onChange={(e) => set(i, { children: it.children.map((x, k) => (k === ci ? { ...x, label: e.target.value } : x)) })}
                    className={cn(CONTROL_CLASS, "w-[160px]", !c.label.trim() && "border-red-400")} />
                  <LinkPicker value={c.href} categories={categories} onChange={(href) => set(i, { children: it.children.map((x, k) => (k === ci ? { ...x, href } : x)) })} />
                  <button type="button" onClick={() => set(i, { children: it.children.filter((_, k) => k !== ci) })} aria-label="Remove dropdown link" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => set(i, { children: [...it.children, { id: newId(), label: "", href: "/" }] })}
                className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-[#9f2089] hover:underline"><Plus className="h-3.5 w-3.5" /> Add dropdown link</button>
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button type="button" onClick={() => { const it: MenuItem = { id: newId(), label: "", href: "/", icon: "link", visibility: "all", enabled: true, newTab: false, autoCategories: false, children: [] }; onChange([...items, it]); setOpen(it.id); }}
          className="flex items-center gap-1.5 rounded-lg border border-[#9f2089] px-3 py-2 text-[0.85rem] font-semibold text-[#9f2089] hover:bg-[#fdf0f9]"><Plus className="h-4 w-4" /> Add menu item</button>
        <button type="button" onClick={() => { if (confirm("Replace this menu with the default items?")) onChange(defaults); }}
          className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-admin-gray-500 hover:text-admin-gray-800"><RotateCcw className="h-3.5 w-3.5" /> Reset to default</button>
      </div>
    </div>
  );
}

/* ───────────────────────── previews ───────────────────────── */

function AudienceToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex rounded-md border border-admin-gray-200 p-0.5 text-xs font-semibold">
      {[false, true].map((v) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={cn("rounded px-2.5 py-1", value === v ? "bg-[#9f2089] text-white" : "text-admin-gray-600 hover:bg-admin-gray-50")}>{v ? "Logged in" : "Guest"}</button>
      ))}
    </div>
  );
}

const never = () => false;

/* ───────────────────────── panels ───────────────────────── */

export function StorefrontSettingsPanels({ active, value, onChange, categories, business }: {
  active: string; value: StorefrontConfig; onChange: (next: StorefrontConfig) => void;
  categories: ShopCategoryNavItem[]; business: ShopBusinessSettings;
}) {
  const [loggedIn, setLoggedIn] = useState(false);
  const set = <K extends keyof StorefrontConfig>(k: K, v: StorefrontConfig[K]) => onChange({ ...value, [k]: v });
  const f = value.footer;
  const setF = (patch: Partial<typeof f>) => set("footer", { ...f, ...patch });
  const setCol = (i: number, patch: Partial<FooterColumn>) => setF({ columns: f.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  if (active === "headerMenu") {
    return (
      <SettingsPanel icon={LayoutPanelTop} title="Header Menu" hint="The menu bar under the header on computers. Items with a dropdown open on hover.">
        <MenuBuilder items={value.headerMenu} onChange={(v) => set("headerMenu", v)} categories={categories} defaults={DEFAULT_HEADER_MENU} />
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-admin-gray-500">Preview</span><AudienceToggle value={loggedIn} onChange={setLoggedIn} /></div>
          <LaptopFrame fluid className="mx-auto max-w-[760px]">
            <div className="h-[230px] bg-[#f5f5f8] [&_nav]:!block">
              <DesktopMenu items={resolveMenu(value.headerMenu, loggedIn, categories)} design={value.menuDesign} isActive={(h) => h === "/"} />
            </div>
          </LaptopFrame>
        </div>
      </SettingsPanel>
    );
  }

  if (active === "sidebarMenu") {
    return (
      <SettingsPanel icon={MenuIcon2} title="Sidebar Menu (Mobile)" hint="The menu inside the ☰ sidebar on phones and tablets, below the location, bell and profile.">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <MenuBuilder items={value.sidebarMenu} onChange={(v) => set("sidebarMenu", v)} categories={categories} defaults={DEFAULT_SIDEBAR_MENU} />
          <div>
            <div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-admin-gray-500"><Smartphone className="h-3.5 w-3.5" /> Preview</span><AudienceToggle value={loggedIn} onChange={setLoggedIn} /></div>
            <PhoneFrame width={272} height={520} className="mx-auto">
              <div className="h-full overflow-y-auto font-storefront">
                <SidebarMenu items={resolveMenu(value.sidebarMenu, loggedIn, categories)} design={value.menuDesign} isActive={(h) => h === "/"} />
              </div>
            </PhoneFrame>
          </div>
        </div>
      </SettingsPanel>
    );
  }

  if (active === "menuDesign") {
    const d = value.menuDesign;
    return (
      <SettingsPanel icon={Palette} title="Menu Design" hint="How the header dropdowns and the mobile sidebar look. Uses your store's own colours — change the highlight here.">
        <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <Field label="Highlight colour" htmlFor="menuAccent" hint="Active item, icons, hover and open dropdowns.">
            <div className="flex items-center gap-2">
              <input type="color" id="menuAccent" value={d.accent} onChange={(e) => set("menuDesign", { ...d, accent: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-admin-gray-200 p-0.5" />
              <input value={d.accent} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && set("menuDesign", { ...d, accent: e.target.value })} className={cn(CONTROL_CLASS, "font-mono")} aria-label="Highlight colour hex" />
            </div>
          </Field>
          <div className="grid content-start gap-2 sm:grid-cols-2">
            <CheckRow checked={d.showIcons} onChange={(v) => set("menuDesign", { ...d, showIcons: v })}>Show icons</CheckRow>
            <CheckRow checked={d.dividers} onChange={(v) => set("menuDesign", { ...d, dividers: v })}>Lines between items</CheckRow>
          </div>
        </div>
        <button type="button" onClick={() => set("menuDesign", DEFAULT_MENU_DESIGN)} className="mt-3 flex items-center gap-1.5 text-[0.8rem] font-semibold text-admin-gray-500 hover:text-admin-gray-800"><RotateCcw className="h-3.5 w-3.5" /> Store default (green)</button>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <PhoneFrame width={250} height={330} className="mx-auto">
            <div className="h-full overflow-y-auto font-storefront">
              <SidebarMenu items={resolveMenu(value.sidebarMenu, false, categories).slice(0, 4)} design={d} isActive={(h) => h === "/"} />
            </div>
          </PhoneFrame>
          <LaptopFrame fluid className="self-center">
            <div className="h-[190px] bg-[#f5f5f8] [&_nav]:!block">
              <DesktopMenu items={resolveMenu(value.headerMenu, false, categories).slice(0, 3)} design={d} isActive={never} />
            </div>
          </LaptopFrame>
        </div>
      </SettingsPanel>
    );
  }

  if (active === "push") {
    const p = value.push;
    return (
      <SettingsPanel icon={Bell} title="Push Notifications" hint="How shoppers are invited to get notifications on your store.">
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckRow checked={p.showBell} onChange={(v) => set("push", { ...p, showBell: v })}>
            Show 🔔 bell until the shopper subscribes (header + sidebar)
          </CheckRow>
          <CheckRow checked={p.autoPrompt} onChange={(v) => set("push", { ...p, autoPrompt: v })}>
            Ask on first visit with the browser&apos;s Allow / Block
          </CheckRow>
        </div>
        <ul className="mt-4 space-y-1.5 rounded-md border border-admin-gray-200 bg-admin-gray-50 px-4 py-3 text-[0.8rem] text-admin-gray-600">
          <li>• <b>Chrome / Edge / Android:</b> the Allow / Block box appears shortly after the page opens.</li>
          <li>• <b>Firefox / Safari:</b> these browsers only allow asking after a tap, so it appears on the shopper&apos;s first tap or click.</li>
          <li>• Once subscribed, the bell disappears everywhere. If someone taps <i>Block</i>, the bell explains how to unblock.</li>
          <li>• A dismissed prompt isn&apos;t repeated for 3 days — browsers penalise sites that ask on every page.</li>
        </ul>
        {!p.showBell && !p.autoPrompt && (
          <p className="mt-3 flex items-start gap-2 text-[0.8rem] text-amber-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />With both off, shoppers have no way to subscribe.</p>
        )}
        <Link href="/push-notifications/push-manager2" className="mt-4 inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-[#9f2089] hover:underline">
          Send notifications &amp; manage subscribers in Push Manager <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </SettingsPanel>
    );
  }

  if (active === "footer") {
    return (
      <SettingsPanel icon={PanelBottom} title="Footer" hint="Logo, phone, email, address and social icons come from Business Identity, Contact and Social Media.">
        <div className="grid gap-4 sm:grid-cols-2">
          {([["bgColor", "Background colour"], ["accentColor", "Heading line colour"]] as const).map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`ft-${k}`}>
              <div className="flex items-center gap-2">
                <input type="color" id={`ft-${k}`} value={f[k]} onChange={(e) => setF({ [k]: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-admin-gray-200 p-0.5" />
                <input value={f[k]} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setF({ [k]: e.target.value })} className={cn(CONTROL_CLASS, "font-mono")} aria-label={`${label} hex`} />
              </div>
            </Field>
          ))}
        </div>
        <Field label="Description" htmlFor="ft-desc" hint="Leave blank to use your Tagline.">
          <textarea id="ft-desc" rows={2} maxLength={400} value={f.description} onChange={(e) => setF({ description: e.target.value })} placeholder={business.tagline || "A line about your store"} className={CONTROL_CLASS} />
        </Field>

        <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-admin-gray-500">Link columns</p>
        <div className="space-y-3">
          {f.columns.map((col, i) => (
            <div key={col.id} className="rounded-lg border border-admin-gray-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <input aria-label="Column title" value={col.title} maxLength={40} onChange={(e) => setCol(i, { title: e.target.value })} placeholder="Column title (e.g. Quick Links)" className={cn(CONTROL_CLASS, "font-semibold")} />
                <button type="button" onClick={() => setF({ columns: f.columns.filter((_, j) => j !== i) })} aria-label="Remove column" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
              {col.links.map((l, li) => (
                <div key={l.id} className="mb-2 flex flex-wrap items-start gap-2">
                  <div className="flex flex-col">
                    <button type="button" disabled={li === 0} aria-label="Move up" onClick={() => { const n = [...col.links]; [n[li], n[li - 1]] = [n[li - 1], n[li]]; setCol(i, { links: n }); }} className="rounded p-0.5 text-admin-gray-500 hover:bg-admin-gray-100 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                    <button type="button" disabled={li === col.links.length - 1} aria-label="Move down" onClick={() => { const n = [...col.links]; [n[li], n[li + 1]] = [n[li + 1], n[li]]; setCol(i, { links: n }); }} className="rounded p-0.5 text-admin-gray-500 hover:bg-admin-gray-100 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                  </div>
                  <input aria-label="Link label" value={l.label} maxLength={40} placeholder="Label" onChange={(e) => setCol(i, { links: col.links.map((x, k) => (k === li ? { ...x, label: e.target.value } : x)) })} className={cn(CONTROL_CLASS, "w-[160px]", !l.label.trim() && "border-red-400")} />
                  <LinkPicker value={l.href} categories={categories} onChange={(href) => setCol(i, { links: col.links.map((x, k) => (k === li ? { ...x, href } : x)) })} />
                  <button type="button" onClick={() => setCol(i, { links: col.links.filter((_, k) => k !== li) })} aria-label="Remove link" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setCol(i, { links: [...col.links, { id: newId(), label: "", href: "/" }] })} className="flex items-center gap-1.5 text-[0.8rem] font-semibold text-[#9f2089] hover:underline"><Plus className="h-3.5 w-3.5" /> Add link</button>
            </div>
          ))}
          {f.columns.length < 3 && (
            <button type="button" onClick={() => setF({ columns: [...f.columns, { id: newId(), title: "", links: [] }] })} className="flex items-center gap-1.5 rounded-lg border border-[#9f2089] px-3 py-2 text-[0.85rem] font-semibold text-[#9f2089] hover:bg-[#fdf0f9]"><Plus className="h-4 w-4" /> Add column</button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CheckRow checked={f.showContactColumn} onChange={(v) => setF({ showContactColumn: v })}>Show contact column (phone, email, address)</CheckRow>
          <input aria-label="Contact column title" value={f.contactTitle} maxLength={40} onChange={(e) => setF({ contactTitle: e.target.value })} disabled={!f.showContactColumn} className={cn(CONTROL_CLASS, "disabled:bg-admin-gray-50")} />
        </div>

        <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-admin-gray-500">&quot;Follow Us&quot; card</p>
        <CheckRow checked={f.ctaEnabled} onChange={(v) => setF({ ctaEnabled: v })}>Show the card</CheckRow>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Title" htmlFor="ft-ct"><input id="ft-ct" value={f.ctaTitle} maxLength={60} onChange={(e) => setF({ ctaTitle: e.target.value })} className={CONTROL_CLASS} /></Field>
          <Field label="Subtitle" htmlFor="ft-cs"><input id="ft-cs" value={f.ctaSubtitle} maxLength={80} onChange={(e) => setF({ ctaSubtitle: e.target.value })} className={CONTROL_CLASS} /></Field>
          <Field label="Button text" htmlFor="ft-bl" hint="Leave blank to hide the button."><input id="ft-bl" value={f.ctaButtonLabel} maxLength={30} onChange={(e) => setF({ ctaButtonLabel: e.target.value })} className={CONTROL_CLASS} /></Field>
          <Field label="Button link" htmlFor="ft-bu" hint="Blank = your WhatsApp link from Social Media, else wa.me/ your first number.">
            <input id="ft-bu" value={f.ctaButtonUrl} onChange={(e) => setF({ ctaButtonUrl: e.target.value })} placeholder="https://wa.me/91XXXXXXXXXX" className={cn(CONTROL_CLASS, f.ctaButtonUrl && !isSafeHref(f.ctaButtonUrl) && "border-red-400")} />
          </Field>
        </div>
        <Field label="Copyright" htmlFor="ft-cr" hint="{year} and {name} are filled in automatically.">
          <input id="ft-cr" value={f.copyright} maxLength={160} onChange={(e) => setF({ copyright: e.target.value })} className={CONTROL_CLASS} />
        </Field>
        <button type="button" onClick={() => { if (confirm("Reset the footer to the default design?")) set("footer", DEFAULT_FOOTER); }} className="mt-1 flex items-center gap-1.5 text-[0.8rem] font-semibold text-admin-gray-500 hover:text-admin-gray-800"><RotateCcw className="h-3.5 w-3.5" /> Reset footer to default</button>

        <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-admin-gray-500">Preview</p>
        <div className="overflow-hidden rounded-lg border border-admin-gray-200 font-storefront [&_footer]:!mt-0">
          <ShopFooter business={business} footer={f} />
        </div>
      </SettingsPanel>
    );
  }
  return null;
}
