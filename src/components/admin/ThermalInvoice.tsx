"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import type { InvoiceData, InvoiceBusinessSettings } from "@/lib/invoice-data";

interface ThermalInvoiceProps {
  data: InvoiceData;
  biz: InvoiceBusinessSettings;
  siteName: string;
  width: "58mm" | "80mm";
}

const fmt = (n: number) => n.toFixed(2);
const fmtQty = (n: number) => {
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, "") || "0";
};
const fmtDate = (d: Date) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).replace(",", " ");

/** Verified against invoice.php lines ~292-373 (the thermal branch), including
 *  live JsBarcode rendering of the order number. */
export function ThermalInvoice({ data, biz, siteName, width }: ThermalInvoiceProps) {
  const { order, items, subtotal, discount, totalGst, cgst, sgst, grandTotal, paidAmount, dueAmount, isFullyPaid, paymentBreakdown, itemCount, totalQty, duePaymentHistory, linkedCreditAmount } = data;
  const barcodeRef = useRef<SVGSVGElement>(null);
  const showLogo = ["logo", "both"].includes(biz.invoiceDisplay) && biz.logo;
  const showName = ["name", "both"].includes(biz.invoiceDisplay) || !biz.logo;
  const logoWidth = Math.min(biz.logoDisplayWidth, 120);

  useEffect(() => {
    const w = window as unknown as { JsBarcode?: (el: SVGSVGElement, text: string, opts: Record<string, unknown>) => void };
    if (w.JsBarcode && barcodeRef.current) {
      w.JsBarcode(barcodeRef.current, order.orderNumber, { format: "CODE128", width: 1.4, height: 34, fontSize: 10, margin: 2 });
    }
  }, [order.orderNumber]);

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js" strategy="afterInteractive" />
      <style>{`@page { size: ${width} auto; margin: 0; } @media print { .print-bar { display: none; } body { background: #fff; } }`}</style>

      <div className="print-bar" style={{ textAlign: "center", margin: "10px" }}>
        <button onClick={() => window.print()} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 4, padding: "6px 14px", cursor: "pointer" }}>Print</button>
        {" "}
        <a href="?format=a4" style={{ background: "#6b7280", color: "#fff", borderRadius: 4, padding: "6px 14px", textDecoration: "none" }}>Full Invoice View</a>
      </div>

      <div style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: "#000", width, margin: "10px auto", background: "#fff", padding: 8 }}>
        <div style={{ textAlign: "center" }}>
          {showLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/${biz.logo}`} alt="" style={{ width: logoWidth, marginBottom: 4 }} />
          )}
          {showName && <div style={{ fontSize: 15, fontWeight: 700 }}>{biz.businessName || siteName}</div>}
        </div>
        {biz.showAddressOnInvoice && biz.address && <div>{biz.address}</div>}
        {biz.showLocationOnInvoice && biz.location && <div>{biz.location}</div>}
        {biz.invoiceNumbers.length > 0 && <div>Tel. : {biz.invoiceNumbers.join(", ")}</div>}
        {biz.hasFssai && <div>FSSAI License No. : {biz.fssaiNumber}</div>}
        {biz.hasGstin && <div>GSTIN : {biz.gstin}</div>}
        {biz.hasPan && <div>PAN : {biz.panNumber}</div>}
        <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "6px 0" }} />

        <div>Invoice No. : {order.orderNumber}</div>
        <div>Date : {fmtDate(order.createdAt)}</div>
        <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "6px 0" }} />

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px dashed #000", width: "40%" }}>Item Name :</th>
              <th style={{ textAlign: "right", borderBottom: "1px dashed #000", width: "20%" }}>Rate</th>
              <th style={{ textAlign: "right", borderBottom: "1px dashed #000", width: "16%" }}>Qty.</th>
              <th style={{ textAlign: "right", borderBottom: "1px dashed #000", width: "24%" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 0" }}>{it.productName}</td>
                <td style={{ padding: "2px 0", textAlign: "right" }}>{fmt(it.price)}</td>
                <td style={{ padding: "2px 0", textAlign: "right" }}>{fmtQty(it.qty)}</td>
                <td style={{ padding: "2px 0", textAlign: "right" }}>{fmt(it.price * it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "6px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Items :  {itemCount.toFixed(2)}</span>
          <span>Qty. :  {fmtQty(totalQty)}</span>
        </div>

        <div style={{ marginTop: 4 }}>
          <Row label="Sub Total :" value={fmt(subtotal)} />
          {discount > 0 && <Row label="Discount :" value={`-${fmt(discount)}`} />}
          {totalGst > 0 && biz.hasGstin ? (
            <>
              <Row label="CGST :" value={fmt(cgst)} />
              <Row label="SGST :" value={fmt(sgst)} />
            </>
          ) : totalGst > 0 ? (
            <Row label="GST :" value={fmt(totalGst)} />
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13, borderTop: "1px dashed #000", marginTop: 4, paddingTop: 4 }}>
            <span>Total :</span><span>{fmt(grandTotal)}</span>
          </div>
          {paymentBreakdown.length > 1
            ? paymentBreakdown.map((pb) => <Row key={pb.paymentMethod} label={`${pb.paymentMethod} Paid :`} value={`₹${fmt(pb.total)}`} />)
            : <Row label={`${order.paymentMethod || "Cash"} Paid :`} value={`₹${fmt(paidAmount)}`} />}
          {!isFullyPaid && <Row label="Due :" value={`₹${fmt(dueAmount)}`} />}
        </div>

        {duePaymentHistory.length > 0 && (
          <>
            <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ fontSize: 10 }}>
              <div>Due History (orig {fmt(linkedCreditAmount ?? 0)}):</div>
              {duePaymentHistory.map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{new Date(h.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })} paid</span>
                  <span>{fmt(h.amount)} (bal {fmt(h.balanceAfter)})</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <svg ref={barcodeRef} />
        </div>

        <hr style={{ border: 0, borderTop: "1px dashed #000", margin: "6px 0" }} />
        <div style={{ textAlign: "center" }}>{biz.invoiceFooterNote || "Thank you, visit again!"}</div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "1px 0" }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
