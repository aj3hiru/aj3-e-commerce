import { PrintButton } from "./PrintButton";
import type { InvoiceData, InvoiceBusinessSettings } from "@/lib/invoice-data";

interface A4InvoiceProps {
  data: InvoiceData;
  biz: InvoiceBusinessSettings;
  siteName: string;
}

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** Verified against invoice.php lines ~177-290 (the `!$is_thermal` branch). */
export function A4Invoice({ data, biz, siteName }: A4InvoiceProps) {
  const { order, customer, items, subtotal, discount, totalGst, cgst, sgst, grandTotal, paidAmount, dueAmount, isFullyPaid, paymentBreakdown, duePaymentHistory, linkedCreditAmount } = data;
  const showLogo = ["logo", "both"].includes(biz.invoiceDisplay) && biz.logo;
  const showName = ["name", "both"].includes(biz.invoiceDisplay) || !biz.logo;
  const logoWidth = Math.min(biz.logoDisplayWidth, 160);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#f3f4f6", color: "#1f2937", minHeight: "100vh" }}>
      <div className="print-bar" style={{ maxWidth: 800, margin: "0 auto 1rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem", paddingTop: "1rem" }}>
        <PrintButton className="btn btn-primary" style={btnPrimary} />
        <a href={`?format=thermal_80`} className="btn btn-secondary" style={btnSecondary}>Thermal View</a>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto 2rem", background: "#fff", padding: "2.5rem", borderRadius: "0.5rem", boxShadow: "0 0.15rem 1.75rem rgba(58,59,69,.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #7c3aed", paddingBottom: "1.5rem", marginBottom: "1.5rem" }}>
          <div>
            {showLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/${biz.logo}`} alt="" style={{ width: logoWidth, marginBottom: "0.4rem" }} />
            )}
            {showName && <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#7c3aed", margin: 0 }}>{biz.businessName || siteName}</h1>}
            {biz.showAddressOnInvoice && biz.address && <div style={bizLine}>{biz.address.split("\n").map((l, i) => <div key={i}>{l}</div>)}</div>}
            {biz.showLocationOnInvoice && biz.location && <div style={bizLine}>{biz.location}</div>}
            {(biz.invoiceNumbers.length > 0 || biz.email) && (
              <div style={bizLine}>{biz.invoiceNumbers.join(", ")}{biz.invoiceNumbers.length > 0 && biz.email ? " · " : ""}{biz.email}</div>
            )}
            {biz.hasGstin && <div style={bizLine}><strong>GSTIN:</strong> {biz.gstin}</div>}
            {biz.hasPan && <div style={bizLine}><strong>PAN:</strong> {biz.panNumber}</div>}
          </div>
          <div style={{ textAlign: "right", fontSize: "0.875rem", color: "#6b7280" }}>
            <div style={{ display: "inline-block", background: "#ede9fe", color: "#6d28d9", fontWeight: 700, fontSize: "0.8125rem", padding: "0.25rem 0.75rem", borderRadius: 9999, marginBottom: "0.4rem" }}>
              {biz.invoiceTitle}
            </div>
            <div><strong>Invoice #:</strong> {order.orderNumber}</div>
            <div><strong>Date:</strong> {fmtDate(order.createdAt)}</div>
            <div><strong>Type:</strong> {order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1)}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem", gap: "2rem" }}>
          <div>
            <h6 style={blockH6}>Billed To</h6>
            <div><strong>{order.customerName || customer?.name || "Walk-in Customer"}</strong></div>
            <div>{order.customerEmail || customer?.email || ""}</div>
            {customer?.phone && <div>{customer.phone}</div>}
            {customer?.address && <div>{customer.address}</div>}
          </div>
          <div>
            <h6 style={blockH6}>Payment</h6>
            <div>Status: <strong>{order.paymentStatus}</strong></div>
            <div>Order Status: <strong>{order.orderStatus}</strong></div>
            {paymentBreakdown.length > 1
              ? paymentBreakdown.map((pb) => <div key={pb.paymentMethod}>{pb.paymentMethod}: ₹{fmt(pb.total)}</div>)
              : paymentBreakdown.length === 1 && <div>{paymentBreakdown[0].paymentMethod} Paid: ₹{fmt(paymentBreakdown[0].total)}</div>}
            {dueAmount > 0 && <div style={{ color: "#dc2626" }}>Amount Due: <strong>₹{fmt(dueAmount)}</strong></div>}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Item</th>
              {biz.hasGstin && <th style={th}>HSN</th>}
              <th style={th}>Qty</th>
              <th style={th}>Price</th>
              <th style={th}>GST</th>
              <th style={{ ...th, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={biz.hasGstin ? 7 : 6} style={{ ...td, textAlign: "center", color: "#6b7280" }}>No line items recorded for this order.</td></tr>
            ) : (
              items.map((it, i) => (
                <tr key={i}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{it.productName}</td>
                  {biz.hasGstin && <td style={td}>{it.hsnCode || "—"}</td>}
                  <td style={td}>{it.qty}</td>
                  <td style={td}>₹{fmt(it.price)}</td>
                  <td style={td}>{it.gstRate.toFixed(2)}%</td>
                  <td style={{ ...td, textAlign: "right" }}>₹{fmt(it.price * it.qty)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ maxWidth: 340, marginLeft: "auto" }}>
          <TotalsRow label="Subtotal" value={`₹${fmt(subtotal)}`} />
          {discount > 0 && <TotalsRow label="Discount" value={`-₹${fmt(discount)}`} />}
          {totalGst > 0 && biz.hasGstin ? (
            <>
              <TotalsRow label="CGST" value={`+₹${fmt(cgst)}`} />
              <TotalsRow label="SGST" value={`+₹${fmt(sgst)}`} />
            </>
          ) : totalGst > 0 ? (
            <TotalsRow label="GST" value={`+₹${fmt(totalGst)}`} />
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "1.125rem", borderTop: "2px solid #1f2937", paddingTop: "0.6rem", marginTop: "0.3rem" }}>
            <span>Grand Total</span><span>₹{fmt(grandTotal)}</span>
          </div>
          <TotalsRow label="Paid" value={`₹${fmt(paidAmount)}`} />
          {isFullyPaid ? (
            <div style={{ display: "flex", justifyContent: "space-between", color: "#10b981", fontWeight: 700 }}><span>Status</span><span>✓ Fully Paid</span></div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", color: "#ef4444", fontWeight: 700 }}><span>Due</span><span>₹{fmt(dueAmount)}</span></div>
          )}
        </div>

        {duePaymentHistory.length > 0 && (
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px dashed #d1d5db" }}>
            <h6 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.03em", color: "#6b7280" }}>Due Payment History</h6>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.2rem 0", color: "#6b7280" }}>
              <span>{fmtDate(order.createdAt)} — Due at time of sale</span>
              <span>₹{fmt(linkedCreditAmount ?? 0)}</span>
            </div>
            {duePaymentHistory.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.2rem 0" }}>
                <span>{fmtDate(h.createdAt)} · {h.paymentMethod} — Paid ₹{fmt(h.amount)}</span>
                <span style={{ color: "#6b7280" }}>{h.balanceAfter > 0.004 ? `Due after: ₹${fmt(h.balanceAfter)}` : "Fully Paid"}</span>
              </div>
            ))}
          </div>
        )}

        {biz.invoiceFooterNote && (
          <p style={{ color: "#6b7280", textAlign: "center", marginTop: "2rem", fontSize: "0.8125rem" }}>
            {biz.invoiceFooterNote.split("\n").map((l, i) => <div key={i}>{l}</div>)}
          </p>
        )}
        <p style={{ color: "#6b7280", textAlign: "center", marginTop: "0.5rem", fontSize: "0.8125rem" }}>
          Thank you for shopping with {biz.businessName || siteName}!
        </p>
      </div>
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0", fontSize: "0.9rem" }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

const th: React.CSSProperties = { background: "#f9fafb", textAlign: "left", padding: "0.7rem 0.9rem", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.03em", color: "#6b7280", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "0.7rem 0.9rem", borderBottom: "1px solid #f3f4f6", fontSize: "0.9rem" };
const bizLine: React.CSSProperties = { fontSize: "0.8125rem", color: "#6b7280", marginTop: "0.15rem" };
const blockH6: React.CSSProperties = { fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: "0.4rem" };
const btnPrimary: React.CSSProperties = { background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.375rem", padding: "0.5rem 1rem", cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "#6b7280", color: "#fff", border: "none", borderRadius: "0.375rem", padding: "0.5rem 1rem", textDecoration: "none", display: "inline-block" };
