import type { InvoiceData } from "@/lib/invoice-data";
import { logoSrc, type InvoiceSettings, type ResolvedSeller } from "@/types/invoice-settings";
import { amountInWords } from "@/lib/amount-words";
import { invDate, invTime, money, qtyText, taxSummary } from "@/lib/invoice-math";
import { Barcode } from "./Barcode";

const BASE = { sm: 11, md: 12, lg: 13.5 } as const;
const MONO = "'Courier New', Courier, monospace";
const SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";

/**
 * Till slip for 58 / 80 mm thermal printers, in four templates. Everything is
 * black on white (thermal heads print nothing else) and spacing is tight so
 * no paper is wasted.
 */
export function ThermalReceipt({ data, s, seller }: { data: InvoiceData; s: InvoiceSettings; seller: ResolvedSeller }) {
  const t = s.thermalTemplate;
  const narrow = s.thermalWidth === "58mm";
  const fs = BASE[s.thermalFont] - (narrow ? 1 : 0);
  const mono = t === "classic" || t === "gst";
  const Hr = ({ solid }: { solid?: boolean }) => <div style={{ borderTop: `1px ${solid || !mono ? "solid" : "dashed"} #000`, margin: "5px 0" }} />;
  const { order, customer, items, subtotal, discount, totalGst, cgst, sgst, grandTotal, paidAmount, dueAmount, isFullyPaid, paymentBreakdown, itemCount, totalQty } = data;
  const when = [s.showDate && invDate(order.createdAt), s.showTime && invTime(order.createdAt)].filter(Boolean).join(" ");
  const customerName = order.customerName || customer?.name || "";
  const pays = paymentBreakdown.length > 1 ? paymentBreakdown.map((p) => ({ k: `${p.paymentMethod} Paid`, v: p.total })) : [{ k: `${paymentBreakdown[0]?.paymentMethod || order.paymentMethod || "Cash"} Paid`, v: paidAmount }];

  return (
    <div style={{ width: s.thermalWidth, padding: narrow ? "3mm 2mm" : "3mm 3.5mm", fontFamily: mono ? MONO : SANS, fontSize: fs, lineHeight: 1.3, color: "#000", background: "#fff", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ textAlign: "center" }}>
        {seller.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc(seller.logo)} alt="" style={{ width: Math.min(s.logoWidth, narrow ? 110 : 150), maxHeight: 70, objectFit: "contain", display: "block", margin: "0 auto 3px", filter: "grayscale(1)" }} />
        )}
        {seller.name && <div style={{ fontSize: fs + (t === "compact" ? 2 : 4), fontWeight: 800, letterSpacing: t === "modern" ? "0.02em" : 0 }}>{seller.name}</div>}
        {seller.tagline && t !== "compact" && <div style={{ fontStyle: "italic" }}>{seller.tagline}</div>}
        {t !== "compact" && seller.address && <div style={{ whiteSpace: "pre-line" }}>{seller.address}</div>}
        {t !== "compact" && seller.location && <div>{seller.location}</div>}
        {seller.phones && <div>Ph: {seller.phones}</div>}
        {t !== "compact" && seller.email && <div>{seller.email}</div>}
        {seller.ids.map((x) => <div key={x.label}>{x.label}: {x.value}</div>)}
      </div>

      {t === "modern" && s.title && (
        <div style={{ textAlign: "center", margin: "6px 0 2px" }}>
          <span style={{ border: "1px solid #000", borderRadius: 3, padding: "1px 8px", fontWeight: 700, textTransform: "uppercase", fontSize: fs - 1, letterSpacing: "0.08em" }}>{s.title}</span>
        </div>
      )}
      {t !== "modern" && s.title && <><Hr /><div style={{ textAlign: "center", fontWeight: 700, textTransform: "uppercase" }}>{s.title}</div></>}
      <Hr />

      {/* Meta */}
      {s.showInvoiceNo && <Pair k="Invoice No" v={order.orderNumber} bold />}
      {when && <Pair k="Date" v={when} />}
      {s.showCustomer && customerName && <Pair k="Customer" v={customerName} />}
      {s.showCustomer && customer?.phone && t !== "compact" && <Pair k="Phone" v={customer.phone} />}
      <Hr />

      {/* Items */}
      {t === "classic" && (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead><tr>{["Item", "Rate", "Qty", "Amt"].map((h, i) => <th key={h} style={{ textAlign: i ? "right" : "left", width: ["42%", "22%", "13%", "23%"][i], fontWeight: 700, paddingBottom: 2, borderBottom: "1px dashed #000" }}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ verticalAlign: "top" }}>
                <td style={{ paddingTop: 2, wordBreak: "break-word" }}>{it.productName}</td>
                <td style={{ paddingTop: 2, textAlign: "right" }}>{money(it.price)}</td>
                <td style={{ paddingTop: 2, textAlign: "right" }}>{qtyText(it.qty)}</td>
                <td style={{ paddingTop: 2, textAlign: "right" }}>{money(it.price * it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {t === "modern" && items.map((it, i) => (
        <div key={i} style={{ padding: "3px 0", borderBottom: i < items.length - 1 ? "1px solid #ddd" : "none" }}>
          <div style={{ fontWeight: 700 }}>{it.productName}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>{qtyText(it.qty)} × ₹{money(it.price)}</span><span style={{ fontWeight: 700 }}>₹{money(it.price * it.qty)}</span></div>
        </div>
      ))}
      {t === "compact" && items.map((it, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
          <span style={{ minWidth: 0 }}>{qtyText(it.qty)}× {it.productName}</span><span style={{ whiteSpace: "nowrap" }}>{money(it.price * it.qty)}</span>
        </div>
      ))}
      {t === "gst" && (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: fs - 1 }}>
          <thead><tr>{["Item/HSN", "Qty", "Rate", "GST", "Amt"].map((h, i) => <th key={h} style={{ textAlign: i ? "right" : "left", width: ["36%", "11%", "19%", "12%", "22%"][i], paddingBottom: 2, borderBottom: "1px dashed #000" }}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ verticalAlign: "top" }}>
                <td style={{ paddingTop: 2, wordBreak: "break-word" }}>{it.productName}{s.showHsn && it.hsnCode ? <div style={{ fontSize: fs - 2 }}>HSN {it.hsnCode}</div> : null}</td>
                <td style={{ paddingTop: 2, textAlign: "right" }}>{qtyText(it.qty)}</td>
                <td style={{ paddingTop: 2, textAlign: "right" }}>{money(it.price)}</td>
                <td style={{ paddingTop: 2, textAlign: "right" }}>{it.gstRate > 0 ? `${qtyText(it.gstRate)}%` : "-"}</td>
                <td style={{ paddingTop: 2, textAlign: "right" }}>{money(it.price * it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Hr />

      {/* Totals */}
      {t !== "compact" && <Pair k={`Items: ${itemCount}`} v={`Qty: ${qtyText(totalQty)}`} />}
      <Pair k="Sub Total" v={money(subtotal)} />
      {discount > 0 && <Pair k="Discount" v={`-${money(discount)}`} />}
      {totalGst > 0 && (seller.gstin ? <><Pair k="CGST" v={money(cgst)} /><Pair k="SGST" v={money(sgst)} /></> : <Pair k="GST" v={money(totalGst)} />)}
      {t === "modern"
        ? <div style={{ display: "flex", justifyContent: "space-between", background: "#000", color: "#fff", fontWeight: 800, fontSize: fs + 3, padding: "4px 6px", margin: "5px 0", borderRadius: 3 }}><span>TOTAL</span><span>₹{money(grandTotal)}</span></div>
        : <><Hr solid /><Pair k="TOTAL" v={`₹${money(grandTotal)}`} bold big={fs + 2} /><Hr solid /></>}
      {s.showPaymentMode && pays.map((p) => <Pair key={p.k} k={p.k} v={`₹${money(p.v)}`} />)}
      {!isFullyPaid && <Pair k="Balance Due" v={`₹${money(dueAmount)}`} bold />}

      {t === "gst" && s.showTaxBreakup && totalGst > 0 && (
        <>
          <Hr />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fs - 2 }}>
            <thead><tr>{["GST%", "Taxable", "CGST", "SGST"].map((h, i) => <th key={h} style={{ textAlign: i ? "right" : "left", borderBottom: "1px dashed #000" }}>{h}</th>)}</tr></thead>
            <tbody>{taxSummary(data).map((r) => <tr key={r.rate}><td>{qtyText(r.rate)}%</td><td style={{ textAlign: "right" }}>{money(r.taxable)}</td><td style={{ textAlign: "right" }}>{money(r.tax / 2)}</td><td style={{ textAlign: "right" }}>{money(r.tax / 2)}</td></tr>)}</tbody>
          </table>
        </>
      )}
      {t === "gst" && s.showAmountInWords && <div style={{ marginTop: 4, fontSize: fs - 1 }}>{amountInWords(grandTotal)}</div>}

      {/* Barcode + thank-you: kept close together */}
      {s.showBarcode && <div style={{ marginTop: 6 }}><Barcode value={order.orderNumber} height={narrow ? 28 : 34} width={narrow ? 1 : 1.3} fontSize={fs - 2} /></div>}
      {s.footerNote.trim() && (
        <>
          <Hr />
          <div style={{ textAlign: "center", fontWeight: t === "modern" ? 700 : 400, whiteSpace: "pre-line" }}>{s.footerNote.trim()}</div>
        </>
      )}
    </div>
  );
}

function Pair({ k, v, bold, big }: { k: string; v: string; bold?: boolean; big?: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: bold ? 800 : 400, fontSize: big }}>
      <span>{k}</span><span style={{ textAlign: "right" }}>{v}</span>
    </div>
  );
}
