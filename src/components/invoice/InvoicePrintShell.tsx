"use client";

import { useEffect } from "react";
import { ArrowLeft, FileText, Printer, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";

/** Toolbar (hidden when printing), paper size and optional auto-print around an invoice. */
export function InvoicePrintShell({ kind, width, autoPrint, children }: { kind: "a4" | "thermal"; width: string; autoPrint: boolean; children: React.ReactNode }) {
  useEffect(() => {
    if (!autoPrint) return;
    // Give the logo and barcode a moment to draw first.
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, [autoPrint]);

  const link = (format: string) => `?format=${format}`;

  return (
    <div className="min-h-screen bg-[#e9e9f0] pb-10 font-storefront print:bg-white print:pb-0">
      <style>{`@page { size: ${kind === "a4" ? "A4" : `${width} auto`}; margin: 0; } @media print { .inv-toolbar { display: none !important; } html, body { background: #fff !important; } .inv-paper { box-shadow: none !important; margin: 0 !important; } }`}</style>
      <div className="inv-toolbar sticky top-0 z-10 mb-6 border-b border-[#dcdce6] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[900px] items-center gap-2 px-4">
          <button type="button" onClick={() => (history.length > 1 ? history.back() : window.close())} className="grid h-9 w-9 place-items-center rounded-full text-[#616173] hover:bg-[#f3f3f7]" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex rounded-[6px] bg-[#f3f3f7] p-1 text-[13px] font-semibold">
            <a href={link("a4")} className={cn("flex h-8 items-center gap-1.5 rounded-[4px] px-3", kind === "a4" ? "bg-white text-[#9f2089] shadow-sm" : "text-[#616173]")}><FileText className="h-4 w-4" />A4</a>
            <a href={link("thermal")} className={cn("flex h-8 items-center gap-1.5 rounded-[4px] px-3", kind === "thermal" ? "bg-white text-[#9f2089] shadow-sm" : "text-[#616173]")}><ReceiptText className="h-4 w-4" />Thermal</a>
          </div>
          <div className="flex-1" />
          <button type="button" onClick={() => window.print()} className="flex h-10 items-center gap-2 rounded-[4px] bg-[#9f2089] px-5 text-[14px] font-semibold text-white hover:bg-[#861b73]">
            <Printer className="h-4 w-4" />Print
          </button>
        </div>
      </div>
      <div className={cn("inv-paper mx-auto w-fit bg-white shadow-[0_8px_30px_rgba(53,53,67,0.15)]")}>{children}</div>
    </div>
  );
}

/** "Ask every time": pick the paper for this invoice. */
export function InvoiceFormatChooser({ number, thermalWidth }: { number: string; thermalWidth: string }) {
  const go = (format: string) => {
    const q = new URLSearchParams(window.location.search);
    q.set("format", format);
    window.location.search = q.toString();
  };
  const card = "group flex flex-1 flex-col items-center gap-3 rounded-[8px] border-2 border-[#eaeaf2] bg-white px-6 py-8 text-center transition outline-none hover:border-[#9f2089] hover:shadow-md focus-visible:border-[#9f2089] focus-visible:ring-4 focus-visible:ring-[#9f2089]/15";
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f3f7] px-4 font-storefront text-[#353543]">
      <div className="w-full max-w-[520px] rounded-[8px] bg-white p-6 shadow-[0_12px_32px_-12px_rgba(53,53,67,0.18)] ring-1 ring-[#eaeaf2]">
        <h1 className="text-[20px] font-bold">Print invoice</h1>
        <p className="mt-1 text-[13.5px] text-[#8b8ba3]">Invoice {number} — choose the paper.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => go("a4")} className={card} autoFocus>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#f8eef6] text-[#9f2089]"><FileText className="h-7 w-7" /></span>
            <span className="text-[16px] font-bold">A4 Invoice</span>
            <span className="text-[12.5px] text-[#8b8ba3]">Full tax invoice on A4 paper</span>
          </button>
          <button type="button" onClick={() => go("thermal")} className={card}>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#f8eef6] text-[#9f2089]"><ReceiptText className="h-7 w-7" /></span>
            <span className="text-[16px] font-bold">Thermal Receipt</span>
            <span className="text-[12.5px] text-[#8b8ba3]">{thermalWidth} till slip</span>
          </button>
        </div>
      </div>
    </main>
  );
}
