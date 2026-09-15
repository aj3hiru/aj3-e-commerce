"use client";

import Link from "next/link";
import { CheckCircle2, ArrowLeft, Printer, Receipt } from "lucide-react";
import type { ReceiptData } from "@/lib/receipt-data";

interface PaymentReceiptProps {
  data: ReceiptData;
  businessName: string;
  phone: string | null;
  format: "a4" | "thermal_58" | "thermal_80";
  returnTo: string;
}

const fmt = (n: number) => n.toFixed(2);

/** Verified against payment-receipt.php — A4 and thermal branches combined into
 *  one component since the receipt is short enough not to need separate files. */
export function PaymentReceipt({ data, businessName, phone, format, returnTo }: PaymentReceiptProps) {
  const isThermal = format.startsWith("thermal_");
  const width = format === "thermal_58" ? "58mm" : "80mm";
  const paidAtStr = new Date(data.paidAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const paidAtShort = new Date(data.paidAt).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

  const printBar = (
    <div className="print-bar" style={{ textAlign: "center", margin: "1rem", display: "flex", justifyContent: "center", gap: "0.5rem" }}>
      <Link href={returnTo} style={btnSecondary}><ArrowLeft className="inline w-3.5 h-3.5 mr-1" />Back</Link>
      <button onClick={() => window.print()} style={btnPrimary}><Printer className="inline w-3.5 h-3.5 mr-1" />Print Receipt</button>
      <a href={`?format=${isThermal ? "a4" : "thermal_80"}&return_to=${encodeURIComponent(returnTo)}`} style={btnSecondary}>
        {isThermal ? "Full View" : "Thermal View"}
      </a>
    </div>
  );

  if (isThermal) {
    return (
      <div style={{ background: "#ddd", minHeight: "100vh" }}>
        <style>{`@page { size: ${width} auto; margin: 0; } @media print { .print-bar { display: none; } body { background: #fff; } }`}</style>
        {printBar}
        <div style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: "#000", width, margin: "10px auto", background: "#fff", padding: 8 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{businessName}</div>
            {phone && <div>{phone}</div>}
            <hr style={hr} />
            <div>Payment Receipt</div>
            <div>#{data.receiptNumber}</div>
            <div>{paidAtShort}</div>
          </div>
          <hr style={hr} />
          <div>From: {data.customerName}</div>
          {data.customerPhone && <div>Ph: {data.customerPhone}</div>}
          <hr style={hr} />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr><th style={thLeft}>Order</th><th style={thLeft}>Method</th><th style={thRight}>Amt</th></tr></thead>
            <tbody>
              {data.payments.map((p, i) => (
                <tr key={i}>
                  <td>{p.orderNumber || "General"}</td>
                  <td>{p.paymentMethod}</td>
                  <td style={{ textAlign: "right" }}>₹{fmt(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr style={hr} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
            <span>TOTAL RECEIVED</span><span>₹{fmt(data.totalPaidThisReceipt)}</span>
          </div>
          <div style={{ marginTop: 6, fontWeight: 700, textAlign: "center", fontSize: 12 }}>
            {data.allClear ? "✓ ALL DUE CLEARED!" : `Due Remaining: ₹${fmt(data.totalOutstanding)}`}
          </div>
          <hr style={hr} />
          <div style={{ textAlign: "center" }}>Thank you!</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#f3f4f6", minHeight: "100vh" }}>
      {printBar}
      <div style={{ maxWidth: 560, margin: "0 auto 2rem", background: "#fff", padding: "2rem", borderRadius: "0.5rem", boxShadow: "0 0.15rem 1.75rem rgba(58,59,69,.1)" }}>
        <div style={{ textAlign: "center", borderBottom: "2px dashed #d1d5db", paddingBottom: "1.25rem", marginBottom: "1.25rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#7c3aed", margin: "0 0 0.2rem" }}>{businessName}</h1>
          {phone && <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>{phone}</div>}
          <div style={{ marginTop: "0.5rem", fontWeight: 700 }}>Payment Receipt</div>
          <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>#{data.receiptNumber} · {paidAtStr}</div>
        </div>

        <p><strong>Received From:</strong> {data.customerName}</p>
        {data.customerPhone && <p><strong>Phone:</strong> {data.customerPhone}</p>}

        <table style={{ width: "100%", borderCollapse: "collapse", margin: "1rem 0" }}>
          <thead><tr><th style={thA4}>Order</th><th style={thA4}>Method</th><th style={{ ...thA4, textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>
            {data.payments.map((p, i) => (
              <tr key={i}>
                <td style={tdA4}>
                  {p.orderId ? (
                    <Link href={`/admin/ecommerce/invoice/${p.orderId}`} target="_blank" style={{ color: "#7c3aed" }}>
                      {p.orderNumber || `Order #${p.orderId}`}
                    </Link>
                  ) : "General Due"}
                </td>
                <td style={tdA4}>{p.paymentMethod}</td>
                <td style={{ ...tdA4, textAlign: "right" }}>₹{fmt(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontWeight: 800, fontSize: "1.2rem", borderTop: "2px solid #1f2937", paddingTop: "0.6rem", marginTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
          <span>Total Received</span><span>₹{fmt(data.totalPaidThisReceipt)}</span>
        </div>

        <div style={{
          marginTop: "0.75rem", padding: "0.75rem 1rem", borderRadius: "0.5rem", fontWeight: 700,
          display: "flex", justifyContent: data.allClear ? "center" : "space-between", alignItems: "center",
          background: data.allClear ? "#d1fae5" : "#fee2e2", color: data.allClear ? "#065f46" : "#991b1b",
        }}>
          {data.allClear ? (
            <span><CheckCircle2 className="inline w-4 h-4 mr-1" />All Due Cleared!</span>
          ) : (
            <><span>Total Due Remaining</span><span>₹{fmt(data.totalOutstanding)}</span></>
          )}
        </div>

        <p style={{ color: "#6b7280", textAlign: "center", marginTop: "2rem", fontSize: "0.8125rem" }}>Thank you!</p>
      </div>
    </div>
  );
}

const hr: React.CSSProperties = { border: 0, borderTop: "1px dashed #000", margin: "6px 0" };
const thLeft: React.CSSProperties = { textAlign: "left", borderBottom: "1px dashed #000", padding: "2px 0" };
const thRight: React.CSSProperties = { textAlign: "right", borderBottom: "1px dashed #000", padding: "2px 0" };
const thA4: React.CSSProperties = { textAlign: "left", fontSize: "0.75rem", textTransform: "uppercase", color: "#6b7280", padding: "0.5rem 0", borderBottom: "1px solid #e5e7eb" };
const tdA4: React.CSSProperties = { padding: "0.5rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.9rem" };
const btnPrimary: React.CSSProperties = { background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.375rem", padding: "0.5rem 1rem", cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "#6b7280", color: "#fff", borderRadius: "0.375rem", padding: "0.5rem 1rem", textDecoration: "none", display: "inline-block" };
