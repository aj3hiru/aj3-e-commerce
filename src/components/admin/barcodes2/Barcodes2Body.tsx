"use client";

import Script from "next/script";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Barcode, CalendarDays, CheckCircle2, ChevronDown, Layers, Loader2, Minus, Package, PackagePlus,
  Plus, Printer, RefreshCw, Search, Trash2, TriangleAlert, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { BarcodeProduct, Barcodes2Data } from "@/lib/barcodes2";
import { money } from "@/components/admin/campaigns2/format";
import { IconAction, PillButton } from "@/components/admin/ui/buttons";

const PAGE_PATH = "/admin/ecommerce/barcode-print";
const EVT_PRINT = "barcodes2:print";

export function Barcodes2HeaderButtons() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_PRINT))}
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-blue-600 px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
      <Printer className="h-4 w-4" /> Print Labels
    </button>
  );
}

/* ── dates ── */
const istTodayYmd = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
function shiftYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const longDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

/** What goes on a label. Everything is on by default; the preview follows at once. */
export interface LabelOptions {
  showName: boolean;
  showBarcode: boolean;
  showCode: boolean;
  showPrice: boolean;
  showUnit: boolean;
  showFooter: boolean;
  usePriceWithOffer: boolean;
  size: "small" | "medium" | "large";
  perRow: number;
}
const DEFAULT_OPTIONS: LabelOptions = {
  showName: true, showBarcode: true, showCode: true, showPrice: true, showUnit: true, showFooter: true,
  usePriceWithOffer: true, size: "medium", perRow: 4,
};

const SIZES = {
  small: { w: 150, barH: 26, name: 9, code: 8, price: 12, pad: 5 },
  medium: { w: 200, barH: 34, name: 11, code: 9, price: 15, pad: 8 },
  large: { w: 260, barH: 46, name: 13, code: 11, price: 19, pad: 10 },
} as const;

interface Line {
  key: string;
  product: BarcodeProduct;
  qty: number;
}

export function Barcodes2Body({ data }: { data: Barcodes2Data }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [navigating, startNavigate] = useTransition();
  const [jsBarcodeReady, setJsBarcodeReady] = useState(false);

  const [options, setOptions] = useState<LabelOptions>(DEFAULT_OPTIONS);
  const setOpt = <K extends keyof LabelOptions>(k: K, v: LabelOptions[K]) => setOptions((o) => ({ ...o, [k]: v }));

  // The print list. Starts with whatever another page asked for (?ids=), else
  // everything added or changed in the range — usually "today".
  const [lines, setLines] = useState<Line[]>(() => {
    const source = data.preselected.length ? data.preselected : data.products;
    return source.map((p) => ({ key: `p${p.id}`, product: p, qty: 1 }));
  });
  const [listFilter, setListFilter] = useState<"all" | "new" | "updated" | "missing">("all");
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Reload the starting list when the range changes (and nothing was preselected).
  const rangeKey = `${data.range.from}:${data.range.to}`;
  const lastRange = useRef(rangeKey);
  useEffect(() => {
    if (lastRange.current === rangeKey) return;
    lastRange.current = rangeKey;
    setLines(data.products.map((p) => ({ key: `p${p.id}`, product: p, qty: 1 })));
  }, [rangeKey, data.products]);

  const totalLabels = lines.reduce((s, l) => s + l.qty, 0);
  const noBarcode = lines.filter((l) => !l.product.barcode).length;

  const visibleLines = useMemo(() => {
    if (listFilter === "new") return lines.filter((l) => l.product.isNew);
    if (listFilter === "updated") return lines.filter((l) => l.product.isUpdated);
    if (listFilter === "missing") return lines.filter((l) => !l.product.barcode);
    return lines;
  }, [lines, listFilter]);

  const addProduct = useCallback((p: BarcodeProduct) => {
    setLines((list) => {
      const found = list.find((l) => l.product.id === p.id);
      if (found) return list.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [{ key: `p${p.id}`, product: p, qty: 1 }, ...list];
    });
  }, []);
  const setQty = (id: number, qty: number) => setLines((list) => list.map((l) => (l.product.id === id ? { ...l, qty: Math.max(1, Math.min(999, qty)) } : l)));
  const removeLine = (id: number) => setLines((list) => list.filter((l) => l.product.id !== id));

  const doPrint = useCallback(() => {
    if (lines.length === 0) return setToast({ ok: false, text: "Add at least one product to print." });
    if (lines.every((l) => !l.product.barcode)) return setToast({ ok: false, text: "None of these products has a barcode yet, so there is nothing to print." });
    window.print();
  }, [lines]);
  const printRef = useRef(doPrint);
  printRef.current = doPrint;
  useEffect(() => {
    const on = () => printRef.current();
    window.addEventListener(EVT_PRINT, on);
    return () => window.removeEventListener(EVT_PRINT, on);
  }, []);

  const navigate = (url: string) => startNavigate(() => router.push(url, { scroll: false }));
  const c = data.cards;
  const sample: BarcodeProduct = lines[0]?.product ?? {
    id: 0, name: "Sample Product 500g", sku: "SKU-0001", barcode: "8901234567890", price: 250, salePrice: 199,
    unit: "500g", stockQty: null, categoryId: null, categoryName: null, brandName: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isNew: false, isUpdated: false,
  };

  return (
    <div className={cn("space-y-5", !loaded && "invisible")} aria-busy={navigating}>
      {/* JsBarcode draws the bars; until it loads the labels show a plain placeholder. */}
      <Script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js" strategy="afterInteractive" onReady={() => setJsBarcodeReady(true)} onLoad={() => setJsBarcodeReady(true)} />
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #bc2-sheet, #bc2-sheet * { visibility: visible !important; }
          #bc2-sheet { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: 0 !important; }
          .bc2-noprint { display: none !important; }
          .bc2-label { border: none !important; page-break-inside: avoid; }
        }
      `}</style>

      <div className="bc2-noprint space-y-5">
        {show("bc2-range") && <RangeBar range={data.range} navigate={navigate} pending={navigating} today={data.today} />}

        {/* Top: the label preview and the numbers, side by side like Sales History 2. */}
        <div className="grid grid-cols-1 gap-5 min-[1500px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {show("bc2-preview") && (
            <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2.5 text-base font-semibold text-admin-gray-900"><Barcode className="h-5 w-5 text-blue-600" /> Label Preview</h2>
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="flex shrink-0 items-start justify-center rounded-xl bg-admin-gray-50 p-4">
                  <Label product={sample} options={options} footer={data.footerText} ready={jsBarcodeReady} preview />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="space-y-2">
                    {([["showName", "Product name on top"], ["showBarcode", "Barcode"], ["showCode", "Barcode number"], ["showPrice", "Price at the bottom"], ["showUnit", "Unit beside the price"], ["showFooter", "Shop line at the very bottom"]] as [keyof LabelOptions, string][]).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 text-sm text-admin-gray-700">
                        <input type="checkbox" checked={options[k] as boolean} onChange={(e) => setOpt(k, e.target.checked as never)} className="h-4 w-4 accent-[#2563eb]" />
                        {label}
                      </label>
                    ))}
                    {options.showPrice && (
                      <label className="ml-6 flex items-center gap-2 text-sm text-admin-gray-600">
                        <input type="checkbox" checked={options.usePriceWithOffer} onChange={(e) => setOpt("usePriceWithOffer", e.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
                        Print the offer price when there is one
                      </label>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-admin-gray-100 pt-3">
                    <label className="flex items-center gap-2 text-sm text-admin-gray-700">
                      Size
                      <span className="relative">
                        <select value={options.size} onChange={(e) => setOpt("size", e.target.value as LabelOptions["size"])} aria-label="Label size"
                          className="h-9 appearance-none rounded-[0.375rem] border border-[#dee2e6] bg-white pl-3 pr-8 text-sm focus:border-[#86b7fe] focus:outline-none">
                          <option value="small">Small</option>
                          <option value="medium">Medium</option>
                          <option value="large">Large</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-600" />
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-admin-gray-700">
                      Per row
                      <span className="relative">
                        <select value={options.perRow} onChange={(e) => setOpt("perRow", Number(e.target.value))} aria-label="Labels per row"
                          className="h-9 appearance-none rounded-[0.375rem] border border-[#dee2e6] bg-white pl-3 pr-8 text-sm focus:border-[#86b7fe] focus:outline-none">
                          {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-600" />
                      </span>
                    </label>
                    <PillButton variant="secondary" onClick={() => setOptions(DEFAULT_OPTIONS)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Reset
                    </PillButton>
                  </div>
                  <p className="text-xs text-admin-gray-500">The preview uses the first product in your list, so what you see is what prints.</p>
                </div>
              </div>
            </section>
          )}

          {show("bc2-cards") && (
            <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2.5 text-base font-semibold text-admin-gray-900"><Layers className="h-5 w-5 text-emerald-600" /> Key Metrics</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {show("bc2-k-added") && <Tile icon={PackagePlus} tone="green" label="Added Today" value={String(c.addedToday)} sub="new products" />}
                {show("bc2-k-updated") && <Tile icon={RefreshCw} tone="blue" label="Updated Today" value={String(c.updatedToday)} sub="restock or price change" />}
                {show("bc2-k-range") && <Tile icon={CalendarDays} tone="navy" label="In This Range" value={String(c.addedInRange + c.updatedInRange)} sub={`${c.addedInRange} added · ${c.updatedInRange} changed`} />}
                {show("bc2-k-queue") && <Tile icon={Printer} tone="green" label="Labels to Print" value={String(totalLabels)} sub={`${lines.length} product${lines.length === 1 ? "" : "s"} in the list`} />}
                {show("bc2-k-missing") && <Tile icon={TriangleAlert} tone="amber" label="No Barcode Yet" value={String(c.missingBarcode)} sub="can't be printed" />}
                {show("bc2-k-total") && <Tile icon={Package} tone="blue" label="All Products" value={c.totalProducts.toLocaleString("en-IN")} sub={`${c.withBarcode.toLocaleString("en-IN")} have a barcode`} />}
              </div>
              {data.truncated && (
                <p className="mt-3 rounded-[0.375rem] bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  This range has more than {c.shown} products. The newest {c.shown} are listed — narrow the dates, or add the others by searching.
                </p>
              )}
            </section>
          )}
        </div>

        {show("bc2-picker") && <ProductPicker onAdd={addProduct} categories={data.categories} inList={new Set(lines.map((l) => l.product.id))} />}

        {show("bc2-list") && (
          <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-admin-gray-900">Print List <span className="ml-1 text-base font-normal text-admin-gray-500">{totalLabels} label{totalLabels === 1 ? "" : "s"}</span></h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex gap-1 rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50 p-1" role="tablist" aria-label="List filter">
                  {([["all", "All"], ["new", "Added"], ["updated", "Changed"], ["missing", "No barcode"]] as const).map(([k, label]) => (
                    <button key={k} type="button" role="tab" aria-selected={listFilter === k} onClick={() => setListFilter(k)}
                      className={cn("rounded-[0.375rem] px-3 py-1.5 text-sm font-medium transition-colors", listFilter === k ? "bg-white text-[#2563eb] shadow-sm" : "text-admin-gray-600 hover:text-admin-gray-900")}>
                      {label}
                    </button>
                  ))}
                </div>
                <PillButton variant="secondary" onClick={() => setLines((l) => l.map((x) => ({ ...x, qty: 1 })))}>Reset quantities</PillButton>
                <PillButton variant="secondary" disabled={lines.length === 0} onClick={() => setLines([])}>Clear list</PillButton>
              </div>
            </div>

            {noBarcode > 0 && (
              <p className="mb-3 flex items-start gap-2 rounded-[0.375rem] bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {noBarcode} product{noBarcode === 1 ? " has" : "s have"} no barcode, so {noBarcode === 1 ? "it is" : "they are"} skipped when printing. Add a barcode on the product page first.
              </p>
            )}

            {visibleLines.length === 0 ? (
              <p className="py-10 text-center text-sm text-admin-gray-500">
                {lines.length === 0 ? "Nothing in the list yet. Products added or changed today appear here, and you can search for any other product above." : "No products match this view."}
              </p>
            ) : (
              <ul className="divide-y divide-admin-gray-100">
                {visibleLines.map((l) => (
                  <li key={l.key} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-admin-gray-900" title={l.product.name}>{l.product.name}</span>
                        {l.product.isNew && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Added</span>}
                        {l.product.isUpdated && <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Changed</span>}
                        {!l.product.barcode && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">No barcode</span>}
                      </span>
                      <span className="block truncate text-xs text-admin-gray-500">
                        {l.product.barcode ?? "—"}{l.product.sku ? ` · ${l.product.sku}` : ""} · {money(priceOf(l.product, true))}{l.product.categoryName ? ` · ${l.product.categoryName}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => setQty(l.product.id, l.qty - 1)} aria-label={`One less label for ${l.product.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-l-[0.375rem] border border-[#dee2e6] bg-white text-admin-gray-700 hover:bg-admin-gray-50"><Minus className="h-4 w-4" /></button>
                      <input inputMode="numeric" value={l.qty} aria-label={`Labels for ${l.product.name}`}
                        onChange={(e) => setQty(l.product.id, Number(e.target.value.replace(/\D/g, "")) || 1)}
                        className="h-9 w-14 border-y border-[#dee2e6] bg-white text-center text-sm outline-none focus:border-[#86b7fe]" />
                      <button type="button" onClick={() => setQty(l.product.id, l.qty + 1)} aria-label={`One more label for ${l.product.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-r-[0.375rem] border border-[#dee2e6] bg-white text-admin-gray-700 hover:bg-admin-gray-50"><Plus className="h-4 w-4" /></button>
                      <span className="ml-1"><IconAction tone="delete" onClick={() => removeLine(l.product.id)} title={`Remove ${l.product.name}`}><Trash2 /></IconAction></span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-admin-gray-100 pt-4">
              <span className="text-sm text-admin-gray-600">{lines.length} product{lines.length === 1 ? "" : "s"} · {totalLabels} label{totalLabels === 1 ? "" : "s"} will print</span>
              <button type="button" onClick={doPrint} className="flex h-10 items-center gap-2 rounded-[0.5rem] bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">
                <Printer className="h-4 w-4" /> Print Labels
              </button>
            </div>
          </section>
        )}
      </div>

      {/* The sheet that actually prints. */}
      <section id="bc2-sheet" className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="bc2-noprint mb-4 text-xl font-semibold text-admin-gray-900">Sheet</h2>
        {lines.length === 0 ? (
          <p className="bc2-noprint py-6 text-center text-sm text-admin-gray-500">Labels appear here once you add products.</p>
        ) : (
          <div className="flex flex-wrap gap-3" style={{ maxWidth: options.perRow * (SIZES[options.size].w + 12) }}>
            {lines.flatMap((l) =>
              l.product.barcode
                ? Array.from({ length: l.qty }, (_, i) => <Label key={`${l.key}-${i}`} product={l.product} options={options} footer={data.footerText} ready={jsBarcodeReady} />)
                : []
            )}
          </div>
        )}
      </section>

      {toast && createPortal(
        <div role="status" className={cn("bc2-noprint fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>,
        document.body
      )}
    </div>
  );
}

/** The price printed on the label. */
function priceOf(p: BarcodeProduct, useOffer: boolean) {
  return useOffer && p.salePrice !== null && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price;
}

/* ───────────────────────── one label ───────────────────────── */

function Label({ product, options, footer, ready, preview }: { product: BarcodeProduct; options: LabelOptions; footer: string; ready: boolean; preview?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const s = SIZES[options.size];

  useEffect(() => {
    const w = window as unknown as { JsBarcode?: (el: SVGSVGElement, text: string, opts: Record<string, unknown>) => void };
    if (!options.showBarcode || !svg.current || !product.barcode) return;
    if (!w.JsBarcode) return;
    try {
      w.JsBarcode(svg.current, product.barcode, {
        format: "CODE128",
        width: options.size === "small" ? 1 : options.size === "large" ? 1.8 : 1.3,
        height: s.barH,
        displayValue: false, // the number is drawn separately so it can be switched off
        margin: 0,
      });
    } catch {
      // An odd barcode value can't be drawn; the number below still prints.
    }
  }, [product.barcode, options.showBarcode, options.size, s.barH, ready]);

  return (
    <div className="bc2-label" style={{ width: s.w, border: "1px dashed #ccc", padding: s.pad, textAlign: "center", fontFamily: "Arial, Helvetica, sans-serif", background: "#fff" }}>
      {options.showName && (
        <div style={{ fontSize: s.name, fontWeight: 700, lineHeight: 1.2, marginBottom: 3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {product.name}
        </div>
      )}
      {options.showBarcode && (
        product.barcode
          ? <svg ref={svg} style={{ display: "block", margin: "0 auto", maxWidth: "100%" }} />
          : <div style={{ fontSize: s.code, color: "#b91c1c", padding: "6px 0" }}>{preview ? "No barcode on this product" : "No barcode"}</div>
      )}
      {options.showCode && product.barcode && (
        <div style={{ fontSize: s.code, letterSpacing: 1, marginTop: 2, fontFamily: "monospace" }}>{product.barcode}</div>
      )}
      {options.showPrice && (
        <div style={{ fontSize: s.price, fontWeight: 700, marginTop: 3 }}>
          {money(priceOf(product, options.usePriceWithOffer))}
          {options.showUnit && product.unit ? <span style={{ fontSize: s.code, fontWeight: 400 }}> / {product.unit}</span> : null}
        </div>
      )}
      {options.showFooter && footer.trim() !== "" && (
        <div style={{ fontSize: s.code - 1, color: "#555", marginTop: 2 }}>{footer}</div>
      )}
    </div>
  );
}

/* ───────────────────────── search & add ───────────────────────── */

function ProductPicker({ onAdd, categories, inList }: { onAdd: (p: BarcodeProduct) => void; categories: { id: number; name: string }[]; inList: Set<number> }) {
  const [q, setQ] = useState("");
  const term = useDeferredValue(q);
  const [category, setCategory] = useState("all");
  const [missingOnly, setMissingOnly] = useState(false);
  const [results, setResults] = useState<BarcodeProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Searching asks the server, because the browser never holds every product.
  useEffect(() => {
    const text = term.trim();
    if (text.length < 2 && category === "all" && !missingOnly) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (text) params.set("q", text);
        if (category !== "all") params.set("category", category);
        if (missingOnly) params.set("missing", "1");
        const res = await fetch(`/api/ecommerce/barcodes2/search?${params.toString()}`, { signal: ac.signal });
        const d = (await res.json().catch(() => ({}))) as { success?: boolean; products?: BarcodeProduct[]; message?: string };
        if (!res.ok || d.success !== true) {
          setError(d.message || "Could not search products.");
          setResults([]);
          return;
        }
        setError(null);
        setResults(d.products ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError("Could not reach the server.");
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [term, category, missingOnly]);

  return (
    <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2.5 text-base font-semibold text-admin-gray-900"><Search className="h-5 w-5 text-blue-600" /> Add Products</h2>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
          {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-admin-gray-400" />}
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products to print" placeholder="Search by name, SKU or barcode…"
            className="h-11 w-full rounded-[0.5rem] border border-[#dee2e6] bg-white pl-9 pr-9 text-sm outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15" />
        </div>
        <label className="relative flex h-11 min-w-[180px] items-center rounded-[0.5rem] border border-admin-gray-200 bg-white pl-3 pr-9">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"
            className="w-full cursor-pointer appearance-none truncate bg-transparent text-sm text-admin-gray-900 focus:outline-none">
            <option value="all">All categories</option>
            {categories.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-500" />
        </label>
        <label className="flex h-11 items-center gap-2 rounded-[0.5rem] border border-admin-gray-200 bg-white px-3 text-sm text-admin-gray-700">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
          Only products without a barcode
        </label>
      </div>

      {error && <p role="alert" className="mt-3 rounded-[0.375rem] bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {results.length > 0 && (
        <ul className="mt-3 max-h-[260px] divide-y divide-admin-gray-100 overflow-y-auto rounded-[0.5rem] border border-admin-gray-200">
          {results.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-admin-gray-900">{p.name}</span>
                <span className="block truncate text-xs text-admin-gray-500">{p.barcode ?? "No barcode"}{p.sku ? ` · ${p.sku}` : ""} · {money(priceOf(p, true))}</span>
              </span>
              <PillButton variant="success" onClick={() => onAdd(p)} className="shrink-0" aria-label={`${inList.has(p.id) ? "Add one more" : "Add"} ${p.name}`}>
                <Plus className="h-3.5 w-3.5" /> {inList.has(p.id) ? "One more" : "Add"}
              </PillButton>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && results.length === 0 && (q.trim().length >= 2 || category !== "all" || missingOnly) && (
        <p className="mt-3 text-sm text-admin-gray-500">No products match that.</p>
      )}
      {q.trim().length === 1 && <p className="mt-3 text-xs text-admin-gray-500">Type at least two letters to search.</p>}
    </section>
  );
}

/* ───────────────────────── small pieces ───────────────────────── */

const TONES = {
  green: { bg: "bg-emerald-600", text: "text-emerald-600" },
  blue: { bg: "bg-blue-600", text: "text-blue-600" },
  navy: { bg: "bg-blue-600", text: "text-slate-800" },
  amber: { bg: "bg-amber-400", text: "text-amber-500" },
} as const;

function Tile({ icon: Icon, tone, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONES; label: string; value: string; sub: string }) {
  return (
    <div className="flex h-full gap-2.5 rounded-xl border border-admin-gray-100 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white", TONES[tone].bg)}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs leading-5 text-admin-gray-700">{label}</div>
        <div className={cn("whitespace-nowrap text-xl font-bold leading-8 tracking-tight", TONES[tone].text)}>{value}</div>
        <div className="truncate text-xs leading-5 text-admin-gray-500">{sub}</div>
      </div>
    </div>
  );
}

function RangeBar({ range, navigate, pending, today }: { range: { from: string; to: string }; navigate: (url: string) => void; pending: boolean; today: string }) {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => { setFrom(range.from); setTo(range.to); }, [range]);

  const t = istTodayYmd() || today;
  const presets: { key: string; label: string; range: [string, string] }[] = [
    { key: "today", label: "Today", range: [t, t] },
    { key: "yesterday", label: "Yesterday", range: [shiftYmd(t, -1), shiftYmd(t, -1)] },
    { key: "7days", label: "7 Days", range: [shiftYmd(t, -6), t] },
    { key: "30days", label: "30 Days", range: [shiftYmd(t, -29), t] },
  ];
  const active = presets.find((p) => p.range[0] === range.from && p.range[1] === range.to);
  const showing = active ? active.label : range.from === range.to ? longDate(range.from) : `${longDate(range.from)} – ${longDate(range.to)}`;
  const go = (a: string, b: string) => navigate(`${PAGE_PATH}?from=${a}&to=${b}`);
  const canApply = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && !(from === range.from && to === range.to);

  return (
    <section className="rounded-xl border border-admin-gray-200 bg-white px-5 py-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="text-sm text-admin-gray-700">Listing products from: <b className="text-admin-gray-900">{showing}</b></div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p.key} type="button" disabled={pending} onClick={() => go(p.range[0], p.range[1])} aria-pressed={active?.key === p.key}
              className={cn("h-9 rounded-[0.375rem] px-3 text-sm font-medium transition-colors", active?.key === p.key ? "bg-[#2563eb] text-white" : "border border-admin-gray-200 bg-white text-admin-gray-700 hover:bg-admin-gray-50")}>
              {p.label}
            </button>
          ))}
        </div>
        <form className="ml-auto flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (canApply) go(from, to); }}>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="h-9 rounded-[0.375rem] border border-[#dee2e6] px-2.5 text-sm focus:border-[#86b7fe] focus:outline-none" />
          <span className="text-sm text-admin-gray-500">to</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="h-9 rounded-[0.375rem] border border-[#dee2e6] px-2.5 text-sm focus:border-[#86b7fe] focus:outline-none" />
          <button type="submit" disabled={!canApply || pending} className="flex h-9 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Apply
          </button>
        </form>
      </div>
      <p className="mt-2 text-xs text-admin-gray-500">Changing the dates replaces the print list with the products added or changed then.</p>
    </section>
  );
}
