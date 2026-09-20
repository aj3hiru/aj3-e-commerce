"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { campaignPriceFor, type CampaignDef, type CampaignDiscountType, type CampaignScope } from "@/lib/campaign-core";
import { parseCampaignInput } from "@/lib/campaign-validate";
import type { CampaignRowData, PickerProduct } from "@/lib/campaigns2";
import { durationText, fromIstInput, money, toIstInput } from "./format";
import { Modal } from "./ui";

/** What the form holds. Ids are kept in arrays so the state stays plain data. */
export interface CampaignFormState {
  name: string;
  scope: CampaignScope;
  catIds: number[];
  brandIds: number[];
  prodIds: number[];
  /** product id → campaign price as typed (for "Fixed price") */
  fixed: Record<number, string>;
  discountType: CampaignDiscountType;
  value: string;
  startMode: "now" | "schedule";
  startAt: string; // India time, as a datetime-local value
  endMode: "none" | "schedule";
  endAt: string;
  paused: boolean;
}

export const EMPTY_FORM: CampaignFormState = {
  name: "", scope: "all", catIds: [], brandIds: [], prodIds: [], fixed: {}, discountType: "percent", value: "",
  startMode: "now", startAt: "", endMode: "none", endAt: "", paused: false,
};

/** A saved campaign → the form. */
export function formFromCampaign(c: CampaignRowData): CampaignFormState {
  const ids = (type: "category" | "brand" | "product") => c.targets.filter((t) => t.type === type).map((t) => t.id);
  return {
    name: c.name,
    scope: c.scope,
    catIds: ids("category"),
    brandIds: ids("brand"),
    prodIds: ids("product"),
    fixed: Object.fromEntries(c.targets.filter((t) => t.fixedPrice !== null).map((t) => [t.id, String(t.fixedPrice)])),
    discountType: c.discountType,
    value: c.discountValue === null ? "" : String(c.discountValue),
    startMode: c.startsAt ? "schedule" : "now",
    startAt: c.startsAt ? toIstInput(c.startsAt) : "",
    endMode: c.endsAt ? "schedule" : "none",
    endAt: c.endsAt ? toIstInput(c.endsAt) : "",
    paused: c.isPaused,
  };
}

interface Props {
  /** Set when editing an existing campaign. */
  editing: CampaignRowData | null;
  /** The starting values (a copy of a campaign, or the edited one). */
  initial: CampaignFormState;
  products: PickerProduct[];
  categories: { id: number; name: string }[];
  brands: { id: number; name: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

const inputCls = "h-10 w-full rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-sm outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15";
const labelCls = "mb-1.5 block text-[13px] font-semibold text-admin-gray-800";

export function CampaignEditor({ editing, initial, products, categories, brands, onClose, onSaved }: Props) {
  const [f, setF] = useState<CampaignFormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CampaignFormState>(k: K, v: CampaignFormState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setError(null);
  };

  const catSet = useMemo(() => new Set(f.catIds), [f.catIds]);
  const brandSet = useMemo(() => new Set(f.brandIds), [f.brandIds]);
  const prodSet = useMemo(() => new Set(f.prodIds), [f.prodIds]);

  /** Picking a scope that can't do "Fixed price" moves the offer back to a percentage. */
  function chooseScope(scope: CampaignScope) {
    setF((s) => ({ ...s, scope, discountType: scope !== "product" && s.discountType === "fixed" ? "percent" : s.discountType }));
    setError(null);
  }

  /** The campaign as the rules see it, for the preview (never saved from here). */
  const draft: CampaignDef | null = useMemo(() => {
    const value = f.discountType === "fixed" ? null : Number(f.value);
    if (f.discountType !== "fixed" && !(value !== null && value > 0)) return null;
    const targets =
      f.scope === "category" ? f.catIds.map((id) => ({ targetType: "category" as const, targetId: id, fixedPrice: null }))
      : f.scope === "brand" ? f.brandIds.map((id) => ({ targetType: "brand" as const, targetId: id, fixedPrice: null }))
      : f.scope === "product" ? f.prodIds.map((id) => ({ targetType: "product" as const, targetId: id, fixedPrice: f.discountType === "fixed" ? Number(f.fixed[id]) || null : null }))
      : [];
    return { id: 0, name: f.name, scope: f.scope, discountType: f.discountType, discountValue: value, startsAt: null, endsAt: null, isPaused: false, targets };
  }, [f]);

  const matched = useMemo(() => {
    const active = products.filter((p) => p.status === "active");
    if (f.scope === "all") return active;
    if (f.scope === "category") return active.filter((p) => p.categoryId !== null && catSet.has(p.categoryId));
    if (f.scope === "brand") return active.filter((p) => p.brandId !== null && brandSet.has(p.brandId));
    return active.filter((p) => prodSet.has(p.id));
  }, [products, f.scope, catSet, brandSet, prodSet]);

  const preview = useMemo(() => {
    if (!draft) return null;
    const now = new Date();
    let example: { name: string; before: number; after: number; regular: number } | null = null;
    let keep = 0;
    for (const p of matched) {
      const hit = campaignPriceFor({ id: p.id, categoryId: p.categoryId, brandId: p.brandId, price: p.price, salePrice: p.salePrice }, [draft], now);
      if (hit) {
        if (!example) example = { name: p.name, before: hit.beforePrice, after: hit.unitPrice, regular: p.price };
      } else keep++;
    }
    return { example, keep };
  }, [draft, matched]);

  // ── schedule helpers ──
  const startIso = f.startMode === "schedule" ? fromIstInput(f.startAt) : null;
  const endIso = f.endMode === "schedule" ? fromIstInput(f.endAt) : null;
  const runFor = startIso && endIso ? new Date(endIso).getTime() - new Date(startIso).getTime() : null;
  /** End-time shortcuts count from the start time (or from now when it starts now). */
  function endShortcut(kind: "tonight" | "24h" | "7d" | "30d") {
    const base = startIso ? new Date(startIso).getTime() : Date.now();
    let target: number;
    if (kind === "tonight") {
      const ymd = toIstInput(new Date(base)).slice(0, 10);
      target = new Date(`${ymd}T23:59:00+05:30`).getTime();
    } else {
      target = base + (kind === "24h" ? 1 : kind === "7d" ? 7 : 30) * 86400000;
    }
    setF((s) => ({ ...s, endMode: "schedule", endAt: toIstInput(new Date(target)) }));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.startMode === "schedule" && !startIso) return setError("Pick the start date and time, or choose “Start now”.");
    if (f.endMode === "schedule" && !endIso) return setError("Pick the end date and time, or choose “No end date”.");

    const payload = {
      name: f.name,
      scope: f.scope,
      discountType: f.discountType,
      discountValue: f.discountType === "fixed" ? null : f.value.trim() === "" ? null : Number(f.value),
      startsAt: startIso,
      endsAt: endIso,
      isPaused: f.paused,
      targets:
        f.scope === "category" ? f.catIds.map((id) => ({ type: "category", id }))
        : f.scope === "brand" ? f.brandIds.map((id) => ({ type: "brand", id }))
        : f.scope === "product" ? f.prodIds.map((id) => ({ type: "product", id, fixedPrice: f.discountType === "fixed" ? (f.fixed[id]?.trim() === "" ? null : Number(f.fixed[id])) : undefined }))
        : [],
    };
    // The same rules the server applies, so most mistakes are caught before sending.
    const check = parseCampaignInput(payload, new Date(), !editing);
    if (!check.ok) return setError(check.message);
    if (f.scope === "product" && f.discountType === "fixed") {
      for (const id of f.prodIds) {
        const p = products.find((x) => x.id === id);
        if (p && Number(f.fixed[id]) >= p.price) return setError(`The campaign price for “${p.name}” must be lower than its regular price (${money(p.price)}).`);
      }
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editing ? `/api/ecommerce/campaigns2/${editing.id}` : "/api/ecommerce/campaigns2", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (!res.ok || data.success !== true) {
        setError(data.message || "Could not save the campaign. Please try again.");
        return;
      }
      onSaved(editing ? `“${f.name.trim()}” saved.` : `Campaign “${f.name.trim()}” created.`);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const scopes: { key: CampaignScope; label: string }[] = [
    { key: "all", label: "All products" },
    { key: "category", label: "Categories" },
    { key: "brand", label: "Brands" },
    { key: "product", label: "Specific products" },
  ];
  const types: { key: CampaignDiscountType; label: string; hint: string }[] = [
    { key: "percent", label: "Percent off", hint: "e.g. 10% off" },
    { key: "amount", label: "Amount off", hint: "e.g. ₹50 off each" },
    { key: "fixed", label: "Fixed price", hint: "own price per product" },
  ];

  return (
    <Modal
      wide
      title={editing ? "Edit Campaign" : "New Campaign"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-4 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="submit" form="campaign-form" disabled={saving} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save Campaign" : "Create Campaign"}
          </button>
        </>
      }
    >
      <form id="campaign-form" onSubmit={submit} className="space-y-6" noValidate>
        {/* name */}
        <div>
          <label htmlFor="cf-name" className={labelCls}>Campaign name</label>
          <input id="cf-name" autoFocus value={f.name} maxLength={150} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Diwali Sale" className={inputCls} />
        </div>

        {/* applies to */}
        <div>
          <span className={labelCls}>Applies to</span>
          <div className="mb-3 inline-flex flex-wrap gap-1 rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50 p-1" role="radiogroup" aria-label="Applies to">
            {scopes.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={f.scope === s.key} onClick={() => chooseScope(s.key)}
                className={cn("rounded-[0.375rem] px-3.5 py-1.5 text-sm font-medium transition-colors", f.scope === s.key ? "bg-white text-[#2563eb] shadow-sm" : "text-admin-gray-600 hover:text-admin-gray-900")}>
                {s.label}
              </button>
            ))}
          </div>

          {f.scope === "all" && <p className="text-[13px] text-admin-gray-500">Every active product in the shop and at the billing counter.</p>}
          {f.scope === "category" && (
            <TargetPicker noun="categories" items={categories.map((c) => ({ id: c.id, name: c.name }))} selected={f.catIds} onChange={(ids) => set("catIds", ids)} />
          )}
          {f.scope === "brand" && (
            <TargetPicker noun="brands" items={brands.map((b) => ({ id: b.id, name: b.name }))} selected={f.brandIds} onChange={(ids) => set("brandIds", ids)} />
          )}
          {f.scope === "product" && (
            <TargetPicker noun="products" items={products.map((p) => ({ id: p.id, name: p.name, hint: `${money(p.price)}${p.status === "active" ? "" : " · inactive"}` }))} selected={f.prodIds} onChange={(ids) => set("prodIds", ids)} />
          )}
        </div>

        {/* offer */}
        <div>
          <span className={labelCls}>Offer</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {types.map((t) => {
              const disabled = t.key === "fixed" && f.scope !== "product";
              const on = f.discountType === t.key;
              return (
                <button key={t.key} type="button" disabled={disabled} aria-pressed={on} onClick={() => set("discountType", t.key)}
                  title={disabled ? "Choose “Specific products” to give each product its own campaign price" : undefined}
                  className={cn("rounded-[0.5rem] border px-3.5 py-2.5 text-left transition-colors", on ? "border-[#2563eb] bg-blue-50/60 ring-1 ring-[#2563eb]/30" : "border-admin-gray-200 bg-white hover:border-admin-gray-300", disabled && "cursor-not-allowed opacity-45")}>
                  <span className="block text-sm font-semibold text-admin-gray-900">{t.label}</span>
                  <span className="block text-xs text-admin-gray-500">{t.hint}</span>
                </button>
              );
            })}
          </div>

          {f.discountType !== "fixed" && (
            <div className="mt-3 max-w-[220px]">
              <div className="relative">
                {f.discountType === "amount" && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-admin-gray-500">₹</span>}
                <input inputMode="decimal" value={f.value} onChange={(e) => set("value", e.target.value)} aria-label={f.discountType === "percent" ? "Percent off" : "Amount off in rupees"}
                  placeholder={f.discountType === "percent" ? "10" : "50"} className={cn(inputCls, f.discountType === "amount" && "pl-7", f.discountType === "percent" && "pr-8")} />
                {f.discountType === "percent" && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-admin-gray-500">%</span>}
              </div>
            </div>
          )}

          {f.discountType === "fixed" && (
            <div className="mt-3 overflow-hidden rounded-[0.5rem] border border-admin-gray-200">
              {f.prodIds.length === 0 ? (
                <p className="px-3.5 py-3 text-[13px] text-admin-gray-500">Choose the products above, then give each one its campaign price here.</p>
              ) : (
                <div className="max-h-[220px] overflow-y-auto">
                  {f.prodIds.map((id) => {
                    const p = products.find((x) => x.id === id);
                    if (!p) return null;
                    const typed = f.fixed[id] ?? "";
                    const bad = typed.trim() !== "" && !(Number(typed) > 0 && Number(typed) < p.price);
                    return (
                      <label key={id} className="flex items-center gap-3 border-b border-admin-gray-100 px-3.5 py-2 last:border-b-0">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-admin-gray-800" title={p.name}>{p.name}</span>
                          <span className="block text-xs text-admin-gray-500">Regular price {money(p.price)}</span>
                        </span>
                        <span className="relative w-[130px] shrink-0">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-admin-gray-500">₹</span>
                          <input inputMode="decimal" value={typed} placeholder="Campaign price" aria-label={`Campaign price for ${p.name}`}
                            onChange={(e) => set("fixed", { ...f.fixed, [id]: e.target.value })} className={cn(inputCls, "pl-7", bad && "border-red-400")} />
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* schedule */}
        <div>
          <span className={labelCls}>Schedule <span className="font-normal text-admin-gray-500">(India time)</span></span>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex gap-4 text-sm">
                <Radio checked={f.startMode === "now"} onChange={() => set("startMode", "now")} label="Start now" />
                <Radio checked={f.startMode === "schedule"} onChange={() => { set("startMode", "schedule"); if (!f.startAt) set("startAt", toIstInput(new Date(Date.now() + 3600000)).slice(0, 13) + ":00"); }} label="Start on" />
              </div>
              <input type="datetime-local" value={f.startAt} disabled={f.startMode !== "schedule"} onChange={(e) => set("startAt", e.target.value)} aria-label="Start date and time" className={cn(inputCls, f.startMode !== "schedule" && "opacity-50")} />
            </div>
            <div>
              <div className="mb-2 flex gap-4 text-sm">
                <Radio checked={f.endMode === "none"} onChange={() => set("endMode", "none")} label="No end date" />
                <Radio checked={f.endMode === "schedule"} onChange={() => { set("endMode", "schedule"); if (!f.endAt) endShortcut("24h"); }} label="End on" />
              </div>
              <input type="datetime-local" value={f.endAt} disabled={f.endMode !== "schedule"} onChange={(e) => set("endAt", e.target.value)} aria-label="End date and time" className={cn(inputCls, f.endMode !== "schedule" && "opacity-50")} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([["tonight", "Tonight 11:59 PM"], ["24h", "+24 hours"], ["7d", "+7 days"], ["30d", "+30 days"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => endShortcut(k)} className="rounded-full border border-admin-gray-200 bg-white px-2.5 py-1 text-xs text-admin-gray-700 hover:bg-admin-gray-50">{label}</button>
                ))}
              </div>
            </div>
          </div>
          {runFor !== null && runFor > 0 && <p className="mt-2 text-[13px] text-admin-gray-500">Runs for {durationText(runFor)}.</p>}
          <label className="mt-3 flex items-center gap-2 text-sm text-admin-gray-700">
            <input type="checkbox" checked={f.paused} onChange={(e) => set("paused", e.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
            Save as paused — prices don&apos;t change until you resume it
          </label>
        </div>

        {/* preview */}
        <div className="rounded-[0.5rem] bg-admin-gray-50 px-4 py-3 text-[13px] leading-6 text-admin-gray-700" aria-live="polite">
          <p>
            Applies to <b className="text-admin-gray-900">{matched.length}</b> active product{matched.length === 1 ? "" : "s"}.
            {preview && preview.keep > 0 && matched.length > 0 && <> {preview.keep} already cost{preview.keep === 1 ? "s" : ""} the same or less, so {preview.keep === 1 ? "it keeps" : "they keep"} the current price.</>}
          </p>
          {preview?.example && (
            <p>Example: <b className="text-admin-gray-900">{preview.example.name}</b> goes from {money(preview.example.before)} to <b className="text-emerald-600">{money(preview.example.after)}</b>.</p>
          )}
          <p className="text-admin-gray-500">A product on a lower sale price keeps it — offers never stack. If two campaigns overlap, the customer gets the lower price.</p>
        </div>

        {error && <p role="alert" className="rounded-[0.375rem] bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-admin-gray-800">
      <input type="radio" checked={checked} onChange={onChange} className="h-4 w-4 accent-[#2563eb]" /> {label}
    </label>
  );
}

const SHOW_LIMIT = 150;

/** Search-and-tick list for categories, brands or products. */
function TargetPicker({ noun, items, selected, onChange }: {
  noun: string; items: { id: number; name: string; hint?: string }[]; selected: number[]; onChange: (ids: number[]) => void;
}) {
  const [q, setQ] = useState("");
  const sel = useMemo(() => new Set(selected), [selected]);
  const term = q.trim().toLowerCase();
  const matches = useMemo(() => (term ? items.filter((i) => i.name.toLowerCase().includes(term)) : items), [items, term]);
  const shown = matches.slice(0, SHOW_LIMIT);
  const toggle = (id: number) => onChange(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const allShownOn = shown.length > 0 && shown.every((i) => sel.has(i.id));

  return (
    <div className="overflow-hidden rounded-[0.5rem] border border-admin-gray-200">
      <div className="flex items-center gap-2 border-b border-admin-gray-100 bg-admin-gray-50 px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${noun}…`} aria-label={`Search ${noun}`}
            className="h-9 w-full rounded-[0.375rem] border border-[#dee2e6] bg-white pl-8 pr-3 text-sm outline-none focus:border-[#86b7fe]" />
        </div>
        <button type="button" disabled={shown.length === 0}
          onClick={() => onChange(allShownOn ? selected.filter((id) => !shown.some((i) => i.id === id)) : [...new Set([...selected, ...shown.map((i) => i.id)])])}
          className="h-9 whitespace-nowrap rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-[13px] font-medium text-admin-gray-700 hover:bg-admin-gray-50 disabled:opacity-50">
          {allShownOn ? "Unselect shown" : "Select shown"}
        </button>
      </div>
      <div className="max-h-[220px] overflow-y-auto" role="group" aria-label={`Choose ${noun}`}>
        {shown.length === 0 ? (
          <p className="px-3.5 py-4 text-center text-[13px] text-admin-gray-500">{items.length === 0 ? `There are no ${noun} yet.` : `No ${noun} match “${q}”.`}</p>
        ) : (
          shown.map((i) => (
            <label key={i.id} className="flex cursor-pointer items-center gap-3 border-b border-admin-gray-100 px-3.5 py-2 text-sm last:border-b-0 hover:bg-admin-gray-50">
              <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} className="h-4 w-4 accent-[#2563eb]" />
              <span className="min-w-0 flex-1 truncate text-admin-gray-800" title={i.name}>{i.name}</span>
              {i.hint && <span className="shrink-0 text-xs text-admin-gray-500">{i.hint}</span>}
            </label>
          ))
        )}
        {matches.length > SHOW_LIMIT && <p className="px-3.5 py-2 text-center text-xs text-admin-gray-500">Showing the first {SHOW_LIMIT} of {matches.length}. Type in the search box to narrow down.</p>}
      </div>
      <div className="flex items-center justify-between border-t border-admin-gray-100 bg-admin-gray-50 px-3.5 py-2 text-[13px] text-admin-gray-600">
        <span><b className="text-admin-gray-900">{selected.length}</b> of {items.length} {noun} chosen</span>
        {selected.length > 0 && <button type="button" onClick={() => onChange([])} className="text-[#2563eb] hover:underline">Clear</button>}
      </div>
    </div>
  );
}
