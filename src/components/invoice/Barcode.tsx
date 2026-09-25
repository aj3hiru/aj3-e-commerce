"use client";

import { useEffect, useRef, useState } from "react";

type JsBarcodeFn = (el: SVGSVGElement, text: string, opts: Record<string, unknown>) => void;
let loading: Promise<JsBarcodeFn | null> | null = null;

function loadJsBarcode(): Promise<JsBarcodeFn | null> {
  const w = window as unknown as { JsBarcode?: JsBarcodeFn };
  if (w.JsBarcode) return Promise.resolve(w.JsBarcode);
  loading ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js";
    s.onload = () => resolve(w.JsBarcode ?? null);
    s.onerror = () => { loading = null; resolve(null); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * CODE128 barcode of the invoice number. Takes no space at all until it has
 * been drawn — an undrawn <svg> is 300×150 by default, which used to leave a
 * big blank gap above the thank-you line on thermal slips.
 */
export function Barcode({ value, height = 34, width = 1.3, fontSize = 10, className }: { value: string; height?: number; width?: number; fontSize?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    let alive = true;
    loadJsBarcode().then((fn) => {
      if (!alive || !fn || !ref.current) return;
      try { fn(ref.current, value, { format: "CODE128", width, height, fontSize, margin: 0, displayValue: true }); setDrawn(true); } catch { /* unsupported characters */ }
    });
    return () => { alive = false; };
  }, [value, height, width, fontSize]);
  return <svg ref={ref} className={className} style={drawn ? { display: "block", margin: "0 auto", maxWidth: "100%" } : { display: "none" }} />;
}
