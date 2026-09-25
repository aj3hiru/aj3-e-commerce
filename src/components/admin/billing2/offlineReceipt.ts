/**
 * A receipt printed on the till itself, for a bill made while the internet is
 * down (the normal invoice page needs the server). It carries the bill's
 * offline id; the proper invoice is available once the bill has uploaded.
 */
export interface OfflineReceipt {
  business: { name: string; address: string | null; phones: string[]; gstin: string | null };
  ref: string;
  soldAt: string;
  customer: string;
  lines: { name: string; qty: number; unitPrice: number; unit?: string | null }[];
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  payments: { method: string; amount: number }[];
  due: number;
  width: "thermal_58" | "thermal_80";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function printOfflineReceipt(r: OfflineReceipt) {
  const mm = r.width === "thermal_58" ? 58 : 80;
  const when = new Date(r.soldAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  const row = (l: string, v: string, bold = false) => `<tr${bold ? ' class="b"' : ""}><td>${l}</td><td class="r">${v}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>
    @page { size: ${mm}mm auto; margin: 3mm; }
    body { font: 12px/1.35 Arial, sans-serif; color: #000; margin: 0; width: ${mm - 6}mm; }
    h1 { font-size: 15px; text-align: center; margin: 0 0 2px; } .c { text-align: center; } .s { font-size: 10.5px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; } table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; } .r { text-align: right; white-space: nowrap; } .b td { font-weight: 700; }
    .tag { border: 1px solid #000; padding: 2px 4px; text-align: center; font-size: 10.5px; margin-top: 4px; }
  </style></head><body>
    <h1>${esc(r.business.name)}</h1>
    ${r.business.address ? `<div class="c s">${esc(r.business.address)}</div>` : ""}
    ${r.business.phones.length ? `<div class="c s">Mob: ${esc(r.business.phones.join(", "))}</div>` : ""}
    ${r.business.gstin ? `<div class="c s">GSTIN: ${esc(r.business.gstin)}</div>` : ""}
    <hr><div class="s">Bill: ${esc(r.ref.slice(-10).toUpperCase())}<br>Date: ${esc(when)}<br>Customer: ${esc(r.customer)}</div><hr>
    <table>${r.lines.map((l) => `<tr><td colspan="2">${esc(l.name)}${l.unit ? ` (${esc(l.unit)})` : ""}</td></tr><tr><td class="s">${l.qty} × ${money(l.unitPrice)}</td><td class="r">${money(l.qty * l.unitPrice)}</td></tr>`).join("")}</table><hr>
    <table>${row("Subtotal", money(r.subtotal))}${r.discount > 0 ? row("Discount", `-${money(r.discount)}`) : ""}${r.gst > 0 ? row("GST", money(r.gst)) : ""}${row("TOTAL", money(r.total), true)}
    ${r.payments.filter((p) => p.amount > 0).map((p) => row(`Paid (${esc(p.method)})`, money(p.amount))).join("")}${r.due > 0.004 ? row("Due", money(r.due), true) : ""}</table>
    <div class="tag">Billed offline — saved on this till, uploads automatically</div>
    <div class="c s" style="margin-top:6px">Thank you! Visit again.</div>
  </body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } finally { setTimeout(() => frame.remove(), 60_000); }
  }, 150);
}
