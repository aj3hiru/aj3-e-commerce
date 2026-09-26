import type { InvoiceData } from "@/lib/invoice-data";
import { logoSrc, type InvoiceSettings, type ResolvedSeller } from "@/types/invoice-settings";
import { amountInWords } from "@/lib/amount-words";
import { invDate, invTime, money, qtyText, taxSummary } from "@/lib/invoice-math";
import { Barcode } from "./Barcode";

/**
 * The A4 tax invoice: one sheet, 210 mm wide. Rendered by the invoice page
 * and, with sample data, by the live preview in Business Settings.
 */
export function A4InvoiceSheet({ data, s, seller }: { data: InvoiceData; s: InvoiceSettings; seller: ResolvedSeller }) {
  const { order, customer, items, subtotal, discount, deliveryCharge, totalGst, cgst, sgst, grandTotal, paidAmount, dueAmount, isFullyPaid, paymentBreakdown, duePaymentHistory, linkedCreditAmount } = data;
  const showHsn = s.showHsn && items.some((i) => i.hsnCode);
  const cols = 5 + (showHsn ? 1 : 0);
  const summary = s.showTaxBreakup && totalGst > 0 ? taxSummary(data) : [];
  const billName = order.customerName || customer?.name || "Walk-in Customer";
  const billAddress = order.shippingAddress || customer?.address || "";
  const methods = paymentBreakdown.length ? paymentBreakdown.map((p) => p.paymentMethod).join(" + ") : order.paymentMethod || "Cash";

  return (
    <div className="a4-sheet relative mx-auto flex w-[210mm] min-h-[297mm] flex-col bg-white text-[12px] leading-[1.45] text-[#1f1f2b]" style={{ ["--inv" as string]: s.accent }}>
      <div className="h-[6px] bg-[var(--inv)]" />
      <div className="flex flex-1 flex-col px-[14mm] pb-[10mm] pt-[9mm]">
        {/* Seller + invoice meta */}
        <header className="flex items-start justify-between gap-8">
          <div className="min-w-0 flex-1">
            {seller.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc(seller.logo)} alt="" style={{ width: s.logoWidth, maxHeight: 90 }} className="mb-2 object-contain" />
            )}
            {seller.name && <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-[var(--inv)]">{seller.name}</h1>}
            {seller.tagline && <p className="text-[11.5px] italic text-[#6b6b80]">{seller.tagline}</p>}
            <div className="mt-1.5 space-y-0.5 text-[11.5px] text-[#4a4a5c]">
              {seller.address && <p className="whitespace-pre-line">{seller.address}</p>}
              {seller.location && <p>{seller.location}</p>}
              {(seller.phones || seller.email) && <p>{[seller.phones && `Ph: ${seller.phones}`, seller.email].filter(Boolean).join("  ·  ")}</p>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[24px] font-black uppercase leading-none tracking-[0.06em] text-[var(--inv)]">{s.title || "Invoice"}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#8b8ba3]">Original for recipient</p>
            <table className="ml-auto mt-3 text-[11.5px]">
              <tbody>
                {s.showInvoiceNo && <MetaRow label="Invoice No." value={order.orderNumber} strong />}
                {s.showDate && <MetaRow label="Date" value={invDate(order.createdAt)} />}
                {s.showTime && <MetaRow label="Time" value={invTime(order.createdAt)} />}
                <MetaRow label="Sale" value={order.orderType === "online" ? "Online order" : "Store bill"} />
              </tbody>
            </table>
            {s.showBarcode && <div className="mt-2 flex justify-end"><Barcode value={order.orderNumber} height={30} width={1.2} fontSize={0} /></div>}
          </div>
        </header>

        {seller.ids.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-[4px] bg-[color-mix(in_srgb,var(--inv)_7%,white)] px-3 py-2 text-[11.5px]">
            {seller.ids.map((x) => <span key={x.label}><span className="text-[#6b6b80]">{x.label}:</span> <b className="tracking-wide">{x.value}</b></span>)}
          </div>
        )}

        {/* Bill to + payment */}
        <section className="mt-5 grid grid-cols-2 gap-4">
          {s.showCustomer ? (
            <Box title="Bill To">
              <p className="text-[13px] font-bold">{billName}</p>
              {customer?.phone && <p>Ph: {customer.phone}</p>}
              {(order.customerEmail || customer?.email) && <p>{order.customerEmail || customer?.email}</p>}
              {billAddress && <p className="mt-0.5 whitespace-pre-line text-[#4a4a5c]">{billAddress}</p>}
              {order.mapUrl && <p className="mt-0.5 text-[10.5px] text-[#6b6b80]">Location: {order.mapUrl.replace(/^https?:\/\//, "")}</p>}
            </Box>
          ) : <div />}
          {s.showPaymentMode && (
            <Box title="Payment">
              <Line k="Mode" v={methods} />
              <Line k="Status" v={isFullyPaid ? "Paid" : paidAmount > 0 ? "Partly paid" : "Unpaid"} />
              {order.orderType === "online" && <Line k="Order status" v={order.orderStatus} />}
              {paymentBreakdown.length > 1 && paymentBreakdown.map((p) => <Line key={p.paymentMethod} k={p.paymentMethod} v={`₹${money(p.total)}`} />)}
            </Box>
          )}
        </section>

        {/* Items */}
        <table className="mt-5 w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="bg-[var(--inv)] text-left text-[10.5px] uppercase tracking-[0.06em] text-white">
              <th className="w-8 px-2.5 py-2 font-semibold">#</th>
              <th className="px-2.5 py-2 font-semibold">Item</th>
              {showHsn && <th className="px-2.5 py-2 font-semibold">HSN</th>}
              <th className="px-2.5 py-2 text-right font-semibold">Qty</th>
              <th className="px-2.5 py-2 text-right font-semibold">Rate</th>
              <th className="px-2.5 py-2 text-right font-semibold">GST</th>
              <th className="px-2.5 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={cols + 1} className="px-2.5 py-4 text-center text-[#8b8ba3]">No items on this order.</td></tr>}
            {items.map((it, i) => (
              <tr key={i} className="border-b border-[#ececf3] even:bg-[#fafafc]">
                <td className="px-2.5 py-2 text-[#8b8ba3]">{i + 1}</td>
                <td className="px-2.5 py-2 font-medium">{it.productName}</td>
                {showHsn && <td className="px-2.5 py-2 text-[#4a4a5c]">{it.hsnCode || "—"}</td>}
                <td className="px-2.5 py-2 text-right">{qtyText(it.qty)}</td>
                <td className="px-2.5 py-2 text-right">₹{money(it.price)}</td>
                <td className="px-2.5 py-2 text-right text-[#4a4a5c]">{it.gstRate > 0 ? `${qtyText(it.gstRate)}%` : "—"}</td>
                <td className="px-2.5 py-2 text-right font-semibold">₹{money(it.price * it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Words + totals */}
        <section className="mt-4 grid grid-cols-[minmax(0,1fr)_72mm] items-start gap-6">
          <div className="space-y-3">
            {s.showAmountInWords && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b8ba3]">Amount in words</p>
                <p className="font-semibold">{amountInWords(grandTotal)}</p>
              </div>
            )}
            {summary.length > 0 && (
              <table className="w-full border-collapse text-[10.5px]">
                <thead>
                  <tr className="border-b border-[#dcdce6] text-left text-[#6b6b80]">
                    <th className="py-1 font-semibold">GST rate</th><th className="py-1 text-right font-semibold">Taxable</th>
                    <th className="py-1 text-right font-semibold">CGST</th><th className="py-1 text-right font-semibold">SGST</th><th className="py-1 text-right font-semibold">Total tax</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r) => (
                    <tr key={r.rate} className="border-b border-[#f0f0f5]">
                      <td className="py-1">{qtyText(r.rate)}%</td><td className="py-1 text-right">₹{money(r.taxable)}</td>
                      <td className="py-1 text-right">₹{money(r.tax / 2)}</td><td className="py-1 text-right">₹{money(r.tax / 2)}</td><td className="py-1 text-right">₹{money(r.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {duePaymentHistory.length > 0 && (
              <div className="text-[10.5px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b8ba3]">Due payments</p>
                <p className="text-[#6b6b80]">{invDate(order.createdAt)} — due at sale ₹{money(linkedCreditAmount ?? 0)}</p>
                {duePaymentHistory.map((h, i) => <p key={i}>{invDate(h.createdAt)} · {h.paymentMethod} ₹{money(h.amount)} <span className="text-[#6b6b80]">(balance ₹{money(h.balanceAfter)})</span></p>)}
              </div>
            )}
          </div>
          <div className="overflow-hidden rounded-[4px] border border-[#e4e4ee]">
            <div className="space-y-1 px-3 py-2.5">
              <Line k="Subtotal" v={`₹${money(subtotal)}`} />
              {discount > 0 && <Line k="Discount" v={`− ₹${money(discount)}`} />}
              {totalGst > 0 && (seller.gstin ? <><Line k="CGST" v={`₹${money(cgst)}`} /><Line k="SGST" v={`₹${money(sgst)}`} /></> : <Line k="GST" v={`₹${money(totalGst)}`} />)}
              {deliveryCharge > 0 && <Line k="Delivery Charge" v={`₹${money(deliveryCharge)}`} />}
            </div>
            <div className="flex items-center justify-between bg-[var(--inv)] px-3 py-2 text-[14px] font-extrabold text-white">
              <span>Grand Total</span><span>₹{money(grandTotal)}</span>
            </div>
            <div className="space-y-1 px-3 py-2.5">
              <Line k="Paid" v={`₹${money(paidAmount)}`} />
              {isFullyPaid
                ? <p className="text-right text-[11px] font-bold uppercase tracking-[0.1em] text-[#038d63]">✓ Fully paid</p>
                : <Line k="Balance due" v={`₹${money(dueAmount)}`} tone="text-[#d0263a] font-bold" />}
            </div>
          </div>
        </section>

        <div className="flex-1" />

        {/* Terms + signature */}
        {(s.terms.trim() || s.showSignature) && (
          <section className="mt-8 grid grid-cols-[minmax(0,1fr)_62mm] items-end gap-6">
            <div>
              {s.terms.trim() && (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b8ba3]">Terms &amp; conditions</p>
                  <p className="mt-0.5 whitespace-pre-line text-[10.5px] text-[#4a4a5c]">{s.terms.trim()}</p>
                </>
              )}
            </div>
            {s.showSignature && (
              <div className="text-center text-[11px]">
                <p className="font-semibold">For {seller.name || "the seller"}</p>
                <div className="h-14" />
                <p className="border-t border-[#b8b8c8] pt-1 text-[#4a4a5c]">{s.signatureLabel || "Authorised Signatory"}</p>
              </div>
            )}
          </section>
        )}

        <footer className="mt-6 border-t border-[#ececf3] pt-3 text-center">
          {s.footerNote.trim() && <p className="whitespace-pre-line text-[12px] font-semibold text-[var(--inv)]">{s.footerNote.trim()}</p>}
          <p className="mt-0.5 text-[9.5px] text-[#a0a0b2]">This is a computer-generated invoice.</p>
        </footer>
      </div>
    </div>
  );
}

function MetaRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <tr><td className="pr-3 text-[#8b8ba3]">{label}</td><td className={strong ? "font-bold" : "font-medium"}>{value}</td></tr>;
}
function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-[#e4e4ee] px-3 py-2.5 text-[11.5px]">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--inv)]">{title}</p>
      {children}
    </div>
  );
}
function Line({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className={`flex justify-between gap-3 ${tone ?? ""}`}><span className="text-[#6b6b80]">{k}</span><span className="text-right font-medium">{v}</span></div>;
}
