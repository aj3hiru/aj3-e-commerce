"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";
import { Printer, Plus, Minus, Trash2 } from "lucide-react";

export interface BarcodeProduct {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
}

interface BarcodePrinterProps {
  allProducts: BarcodeProduct[];
  barcodeFooter: string;
}

/** Verified against admin/ecommerce/barcode-print.php: a picker (add product +
 *  quantity), and a printable label sheet with live-rendered CODE128 barcodes
 *  and an editable footer text applied to every label at once. */
export function BarcodePrinter({ allProducts, barcodeFooter }: BarcodePrinterProps) {
  const [selected, setSelected] = useState<{ product: BarcodeProduct; qty: number }[]>([]);
  const [productId, setProductId] = useState("");
  const [footerText, setFooterText] = useState(barcodeFooter);
  const [printing, setPrinting] = useState(false);

  function addProduct() {
    const product = allProducts.find((p) => p.id === Number(productId));
    if (!product) return;
    setSelected((prev) => {
      const existing = prev.find((s) => s.product.id === product.id);
      if (existing) return prev.map((s) => (s.product.id === product.id ? { ...s, qty: s.qty + 1 } : s));
      return [...prev, { product, qty: 1 }];
    });
    setProductId("");
  }

  function changeQty(id: number, delta: number) {
    setSelected((prev) => prev.map((s) => (s.product.id === id ? { ...s, qty: Math.max(1, s.qty + delta) } : s)).filter((s) => s.qty > 0));
  }

  function removeItem(id: number) {
    setSelected((prev) => prev.filter((s) => s.product.id !== id));
  }

  const labels = selected.flatMap((s) => Array.from({ length: s.qty }, () => s.product));

  if (printing) {
    return <PrintView labels={labels} footerText={footerText} onBack={() => setPrinting(false)} />;
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
        <h5 className="font-bold mb-3">Select Products to Print</h5>
        <div className="flex items-end gap-2 mb-4">
          <div className="flex-1">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="">Select a product</option>
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ""}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={addProduct} disabled={!productId} className="bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-4 py-2 disabled:opacity-60">
            Add
          </button>
        </div>

        {selected.length === 0 ? (
          <p className="text-sm text-admin-gray-400 text-center py-6">No products selected yet.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {selected.map((s) => (
              <div key={s.product.id} className="flex items-center justify-between border border-admin-gray-100 rounded-lg px-3 py-2">
                <span className="text-sm font-medium">{s.product.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(s.product.id, -1)} className="w-7 h-7 flex items-center justify-center bg-admin-gray-100 rounded"><Minus className="w-3 h-3" /></button>
                  <span className="w-8 text-center text-sm">{s.qty}</span>
                  <button onClick={() => changeQty(s.product.id, 1)} className="w-7 h-7 flex items-center justify-center bg-admin-gray-100 rounded"><Plus className="w-3 h-3" /></button>
                  <button onClick={() => removeItem(s.product.id)} className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-600 rounded ml-2"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs font-medium mb-1">Footer Text (shown on every label)</label>
          <input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="e.g. shop name" className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>

        <button
          type="button"
          disabled={labels.length === 0}
          onClick={() => setPrinting(true)}
          className="w-full flex items-center justify-center gap-2 bg-admin-primary hover:bg-admin-primary-dark text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
        >
          <Printer className="w-4 h-4" /> Print {labels.length} Label{labels.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

function PrintView({ labels, footerText, onBack }: { labels: BarcodeProduct[]; footerText: string; onBack: () => void }) {
  const [liveFooter, setLiveFooter] = useState(footerText);

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js" strategy="afterInteractive" />
      <style>{`@media print { .no-print { display: none !important; } .barcode-label { border: none !important; page-break-inside: avoid; } }`}</style>

      <div className="no-print flex items-center gap-3 mb-4">
        <input
          value={liveFooter}
          onChange={(e) => setLiveFooter(e.target.value)}
          placeholder="Custom text on labels"
          className="border border-admin-gray-200 rounded px-3 py-2 text-sm w-72"
        />
        <button onClick={() => window.print()} className="bg-admin-primary text-white text-sm font-semibold rounded px-4 py-2">
          🖨️ Print {labels.length} Label{labels.length === 1 ? "" : "s"}
        </button>
        <button onClick={onBack} className="text-sm text-admin-gray-500">← Back to picker</button>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {labels.map((p, i) => (
          <BarcodeLabel key={i} product={p} footerText={liveFooter} />
        ))}
      </div>
    </>
  );
}

function BarcodeLabel({ product, footerText }: { product: BarcodeProduct; footerText: string }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const price = product.salePrice && product.salePrice > 0 && product.salePrice < product.price ? product.salePrice : product.price;

  useEffect(() => {
    const w = window as unknown as { JsBarcode?: (el: SVGSVGElement, text: string, opts: Record<string, unknown>) => void };
    if (w.JsBarcode && barcodeRef.current && product.barcode) {
      w.JsBarcode(barcodeRef.current, product.barcode, { format: "CODE128", width: 1.3, height: 32, fontSize: 10, margin: 2 });
    }
  }, [product.barcode]);

  return (
    <div className="barcode-label" style={{ width: 200, border: "1px dashed #ccc", padding: 8, textAlign: "center", fontFamily: "Arial, sans-serif" }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.name}</div>
      {product.barcode ? <svg ref={barcodeRef} /> : <div style={{ fontSize: 10, color: "#999" }}>No barcode set</div>}
      <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>₹{price.toFixed(2)}</div>
      {footerText && <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{footerText}</div>}
    </div>
  );
}
