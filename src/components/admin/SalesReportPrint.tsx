"use client";

import type { SalesReportData } from "@/lib/sales-report-data";
import type { InvoiceBusinessSettings } from "@/lib/invoice-data";

interface SalesReportPrintProps {
  data: SalesReportData;
  biz: Pick<InvoiceBusinessSettings, "businessName" | "hasGstin" | "hasPan" | "hasFssai" | "gstin" | "panNumber" | "fssaiNumber" | "showAddressOnInvoice" | "address">;
  rangeLabel: string;
  saleTypeLabel: string;
}

const fmt = (n: number) => n.toFixed(2);
const fmtDate = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** Verified against the report body in admin/ecommerce/sales-report-print.php:
 *  4 summary boxes, payment-method breakdown, sales table, new-dues table,
 *  collections table, online-orders-by-status breakdown. */
export function SalesReportPrint({ data, biz, rangeLabel, saleTypeLabel }: SalesReportPrintProps) {
  return (
    <div style={{ fontFamily: "'Inter', Arial, sans-serif", background: "#f3f4f6", color: "#1f2937", minHeight: "100vh" }}>
      <style>{`@page { size: A4; margin: 15mm; } @media print { .print-bar { display: none; } body { background: #fff; } }`}</style>

      <div className="print-bar" style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "flex-end", paddingTop: "1rem" }}>
        <button onClick={() => window.print()} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: "0.375rem", padding: "0.5rem 1rem", cursor: "pointer" }}>
          Print / Save as PDF
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: "1.5rem auto", background: "#fff", padding: "2.5rem", borderRadius: "0.5rem", boxShadow: "0 0.15rem 1.75rem rgba(58,59,69,.1)" }}>
        <div style={{ textAlign: "center", borderBottom: "2px solid #1f2937", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#7c3aed", marginBottom: "0.2rem" }}>{biz.businessName}</h1>
          <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
            Sales Report — {rangeLabel} · {saleTypeLabel}
            {biz.hasGstin && ` · GSTIN: ${biz.gstin}`}
            {biz.hasPan && ` · PAN: ${biz.panNumber}`}
          </div>
          {biz.showAddressOnInvoice && biz.address && <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>{biz.address}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "2rem" }}>
          <SummaryBox num={`₹${fmt(data.salesTotal)}`} label="Total Sales" />
          <SummaryBox num={`₹${fmt(data.salesPaid)}`} label="Collected" />
          <SummaryBox num={`₹${fmt(data.salesDue)}`} label="Outstanding" />
          <SummaryBox num={String(data.sales.length)} label="Transactions" />
        </div>

        <SectionTitle>Payment Method Breakdown</SectionTitle>
        <table className="report-table" style={tableStyle}>
          <thead><tr>{Object.keys(data.byMethod).map((m) => <th key={m} style={thStyle}>{m}</th>)}</tr></thead>
          <tbody><tr>{Object.values(data.byMethod).map((v, i) => <td key={i} style={tdStyle}>₹{fmt(v)}</td>)}</tr></tbody>
        </table>

        <SectionTitle>Sales ({data.sales.length})</SectionTitle>
        {data.sales.length === 0 ? (
          <p style={emptyStyle}>No sales in this period.</p>
        ) : (
          <table className="report-table" style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Order #</th><th style={thStyle}>Items</th><th style={thStyle}>Type</th>
                <th style={thStyle}>Method</th><th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Paid</th><th style={{ ...thStyle, textAlign: "right" }}>Due</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.sales.map((s, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{s.orderNumber}</td>
                  <td style={tdStyle}>{s.itemsSummary}</td>
                  <td style={tdStyle}>{s.orderType === "offline" ? "Store" : "Online"}</td>
                  <td style={tdStyle}>{s.paymentMethod}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(s.totalAmount)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(s.livePaid)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(s.liveDue)}</td>
                  <td style={tdStyle}>{fmtDate(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4} style={tdStyle}>Total</td><td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(data.salesTotal)}</td><td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(data.salesPaid)}</td><td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(data.salesDue)}</td><td style={tdStyle}></td></tr></tfoot>
          </table>
        )}

        <SectionTitle>New Dues Created ({data.newDues.length})</SectionTitle>
        {data.newDues.length === 0 ? (
          <p style={emptyStyle}>No new dues in this period.</p>
        ) : (
          <table className="report-table" style={tableStyle}>
            <thead><tr><th style={thStyle}>Customer</th><th style={thStyle}>Order #</th><th style={{ ...thStyle, textAlign: "right" }}>Amount</th><th style={thStyle}>Date</th></tr></thead>
            <tbody>
              {data.newDues.map((d, i) => (
                <tr key={i}><td style={tdStyle}>{d.customerName}</td><td style={tdStyle}>{d.orderNumber ?? "—"}</td><td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(d.amount)}</td><td style={tdStyle}>{fmtDate(d.createdAt)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2} style={tdStyle}>Total</td><td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(data.newDuesTotal)}</td><td style={tdStyle}></td></tr></tfoot>
          </table>
        )}

        <SectionTitle>Due Collections ({data.collections.length})</SectionTitle>
        {data.collections.length === 0 ? (
          <p style={emptyStyle}>No due payments collected in this period.</p>
        ) : (
          <table className="report-table" style={tableStyle}>
            <thead><tr><th style={thStyle}>Customer</th><th style={thStyle}>Order #</th><th style={thStyle}>Method</th><th style={{ ...thStyle, textAlign: "right" }}>Amount</th><th style={thStyle}>Date</th></tr></thead>
            <tbody>
              {data.collections.map((c, i) => (
                <tr key={i}><td style={tdStyle}>{c.customerName}</td><td style={tdStyle}>{c.orderNumber ?? "—"}</td><td style={tdStyle}>{c.paymentMethod}</td><td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(c.amount)}</td><td style={tdStyle}>{fmtDate(c.createdAt)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3} style={tdStyle}>Total</td><td style={{ ...tdStyle, textAlign: "right" }}>₹{fmt(data.collectionsTotal)}</td><td style={tdStyle}></td></tr></tfoot>
          </table>
        )}

        <SectionTitle>Online Orders by Status</SectionTitle>
        <table className="report-table" style={tableStyle}>
          <thead><tr>{Object.keys(data.onlineCounts).map((s) => <th key={s} style={thStyle}>{s}</th>)}</tr></thead>
          <tbody><tr>{Object.values(data.onlineCounts).map((v, i) => <td key={i} style={tdStyle}>{v}</td>)}</tr></tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryBox({ num, label }: { num: string; label: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.85rem", textAlign: "center" }}>
      <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>{num}</div>
      <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.02em", marginTop: "0.2rem" }}>{label}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "2rem 0 0.75rem", paddingBottom: "0.4rem", borderBottom: "2px solid #e5e7eb" }}>{children}</h3>;
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", marginBottom: "0.5rem" };
const thStyle: React.CSSProperties = { background: "#f9fafb", textAlign: "left", padding: "0.5rem 0.6rem", border: "1px solid #e5e7eb", fontSize: "0.7rem", textTransform: "uppercase", color: "#6b7280" };
const tdStyle: React.CSSProperties = { padding: "0.5rem 0.6rem", border: "1px solid #f3f4f6" };
const emptyStyle: React.CSSProperties = { color: "#9ca3af", fontStyle: "italic", padding: "0.75rem 0" };
