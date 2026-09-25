"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Ban, Banknote, Bike, CalendarDays, Check, CheckCircle2, ChevronDown, CircleAlert, ClipboardList, CreditCard, ExternalLink,
  FileText, History, Lock, Mail, MapPin, MessageCircle, Minus, Package, PackageCheck, Phone, Plus, Printer, ReceiptText, Send, Store,
  Trash2, Truck, UserRound, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ORDER_STATUSES } from "@/lib/order-statuses";
import { StatusPill, StatusBadge } from "@/components/admin/ui/buttons";
import { orderStatusVariant, paymentStatusVariant } from "@/components/admin/StatusDropdown";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";

export interface OrderDetailItem {
  id: number;
  productName: string;
  qty: number;
  price: number;
  gstRate?: number;
  image?: string | null;
  slug?: string | null;
}

export interface OrderDetailData {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  shippingAddress: string | null;
  /** Google Maps link to the pinned delivery location, when the customer shared one. */
  mapUrl?: string | null;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  totalAmount: number;
  locked: boolean;
  dueBalance: number;
  duePaymentCount: number;
  linkedCreditId: number | null;
  orderType?: string;
  agent?: { id: number; name: string; assignedAt: string | null } | null;
  cancelReason?: string | null;
  customerId?: number | null;
  createdAt?: string;
  subtotal?: number;
  discount?: number;
  gst?: number;
  paidAmount?: number;
  lat?: number | null;
  lng?: number | null;
}

export interface OrderEventRow { id: number; type: string; from: string | null; to: string | null; note: string | null; actor: string; at: string }
export interface OrderPerms { accept: boolean; status: boolean; assign: boolean; pay: boolean; cancel: boolean; editItems: boolean }

interface OrderDetailViewProps {
  order: OrderDetailData;
  items: OrderDetailItem[];
  availableProducts: { id: number; name: string; sku: string | null; price: number }[];
  perms?: OrderPerms;
  agents?: { id: number; name: string }[];
  events?: OrderEventRow[];
}

const ALL: OrderPerms = { accept: true, status: true, assign: true, pay: true, cancel: true, editItems: true };
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const CARD = "rounded-[10px] border border-admin-gray-200 bg-white shadow-sm";
const th = "border-b border-[#e6e8ef] px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.05em] text-admin-gray-500";
const td = "border-b border-[#eef0f4] px-3 py-3 align-middle";

function eventText(e: OrderEventRow): string {
  if (e.type === "placed") return "Order placed by the customer";
  if (e.type === "assign") return e.to ? `Assigned to ${e.to}${e.from ? ` (was ${e.from})` : ""}` : `Delivery agent ${e.from ?? ""} removed`;
  if (e.type === "payment") return `Payment ${e.from ?? "?"} → ${e.to ?? "?"}`;
  if (e.type === "note") return "Note";
  if (e.type === "status") return e.from === "Pending" && e.to === "In Progress" ? "Order accepted" : e.from === "Pending" && e.to === "Canceled" ? "Order rejected" : `Status ${e.from ?? "?"} → ${e.to ?? "?"}`;
  return e.type;
}

const STEPS = [
  { key: "Pending", label: "Placed", icon: ClipboardList },
  { key: "In Progress", label: "Accepted", icon: Package },
  { key: "Out for Delivery", label: "Out for delivery", icon: Truck },
  { key: "Delivered", label: "Delivered", icon: PackageCheck },
];

/** One order: header, progress, items with the bill, history — and on the right the next steps, customer, address and payment. */
export function OrderDetailView({ order, items, availableProducts, perms = ALL, agents = [], events = [] }: OrderDetailViewProps) {
  const router = useRouter();
  const { isVisible, loaded } = useDashboardWidgetPrefs();
  const show = (group: string, key?: string) => isVisible(group) && (key ? isVisible(key) : true);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [agentId, setAgentId] = useState(order.agent ? String(order.agent.id) : "");
  const [payMethod, setPayMethod] = useState("Cash");
  const [reasonFor, setReasonFor] = useState<null | "reject" | "cancel">(null);
  const [reason, setReason] = useState("");
  const [more, setMore] = useState(false);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 4500); return () => clearTimeout(t); }, [notice]);

  const online = order.orderType !== "offline";
  const st = order.orderStatus, paid = order.paymentStatus === "Paid";
  const editable = !order.locked && perms.editItems;
  const phoneDigits = (order.customerPhone ?? "").replace(/\D/g, "");
  const wa = phoneDigits ? `https://wa.me/${phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits}` : null;
  const subtotal = order.subtotal ?? items.reduce((n, i) => n + i.price * i.qty, 0);
  const paidAmount = order.paidAmount ?? (paid ? order.totalAmount : 0);
  const due = order.dueBalance > 0.004 ? order.dueBalance : Math.max(0, order.totalAmount - paidAmount);

  async function call(url: string, method: string, body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      setNotice({ type: data.success ? "success" : "error", message: data.message || (data.success ? "Saved." : "Couldn't save.") });
      if (data.success) router.refresh();
      return !!data.success;
    } finally {
      setBusy(false);
    }
  }
  const callStatusApi = (body: Record<string, unknown>) => call(`/api/ecommerce/orders/${order.id}/status`, "PATCH", body);
  const callItemsApi = (body: Record<string, unknown>) => call(`/api/ecommerce/orders/${order.id}/items`, "POST", body);

  const stepIndex = STEPS.findIndex((s) => s.key === st);

  return (
    <div className={cn("space-y-4", !loaded && "invisible")}>
      {notice && (
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] max-w-md rounded-[8px] border px-4 py-3 text-sm shadow-lg", notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {notice.message}
        </div>
      )}

      {/* ── Header ── */}
      {isVisible("ov-header") && (
        <section className={cn(CARD, "flex flex-wrap items-center gap-4 px-5 py-4")}>
          <Link href="/admin/ecommerce/orders" className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-admin-gray-500 hover:bg-admin-gray-100" aria-label="Back to orders"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-admin-gray-900">{order.orderNumber}</h2>
              {show("ov-header", "ov-h-type") && (
                <span className={cn("inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-xs font-semibold", online ? "bg-violet-50 text-violet-700" : "bg-amber-50 text-amber-700")}>
                  {online ? <Truck className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}{online ? "Online order" : "Store bill"}
                </span>
              )}
              {order.locked && <span className="inline-flex items-center gap-1 rounded-[6px] bg-admin-gray-100 px-2 py-0.5 text-xs font-semibold text-admin-gray-600"><Lock className="h-3 w-3" />Locked</span>}
            </div>
            {show("ov-header", "ov-h-date") && order.createdAt && <p className="mt-0.5 flex items-center gap-1.5 text-sm text-admin-gray-500"><CalendarDays className="h-3.5 w-3.5" />{when(order.createdAt)}</p>}
          </div>
          {show("ov-header", "ov-h-pills") && (
            <div className="flex flex-wrap items-center gap-2">
              {perms.status && !order.locked ? (
                <StatusPill label={`Change order status for ${order.orderNumber}`} value={st} disabled={busy}
                  options={ORDER_STATUSES.map((v) => ({ value: v, label: v, variant: orderStatusVariant(v) }))}
                  onChange={(next) => (next === "Canceled" ? (setReasonFor("cancel"), setReason("")) : callStatusApi({ action: "update_status", orderStatus: next }))} />
              ) : <StatusBadge variant={orderStatusVariant(st)}>{st}</StatusBadge>}
              {perms.pay && !order.locked ? (
                <StatusPill label={`Change payment status for ${order.orderNumber}`} value={paid ? "Paid" : "Unpaid"} disabled={busy}
                  options={[{ value: "Paid", label: "Paid", variant: "success" }, { value: "Unpaid", label: "Unpaid", variant: "secondary" }]}
                  onChange={(next) => callStatusApi({ action: "update_payment", paymentStatus: next })} />
              ) : <StatusBadge variant={paymentStatusVariant(order.paymentStatus)}>{order.paymentStatus}</StatusBadge>}
            </div>
          )}
          {show("ov-header", "ov-h-total") && (
            <div className="text-right">
              <p className="text-xs text-admin-gray-500">Total</p>
              <p className="text-2xl font-extrabold leading-tight text-admin-gray-900">{money(order.totalAmount)}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {show("ov-header", "ov-h-print") && (
              <>
                <a href={`/admin/ecommerce/invoice/${order.id}?format=a4`} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center gap-1.5 rounded-[8px] border border-admin-gray-200 bg-white px-3 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50"><FileText className="h-4 w-4" />A4</a>
                <a href={`/admin/ecommerce/invoice/${order.id}?format=thermal`} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center gap-1.5 rounded-[8px] border border-admin-gray-200 bg-white px-3 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50"><Printer className="h-4 w-4" />Thermal</a>
              </>
            )}
            {show("ov-header", "ov-h-contact") && order.customerPhone && (
              <>
                <a href={`tel:${order.customerPhone}`} title="Call customer" className="grid h-9 w-9 place-items-center rounded-[8px] border border-admin-gray-200 bg-white text-admin-gray-600 hover:bg-admin-gray-50"><Phone className="h-4 w-4" /></a>
                {wa && <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp customer" className="grid h-9 w-9 place-items-center rounded-[8px] border border-admin-gray-200 bg-white text-emerald-600 hover:bg-emerald-50"><MessageCircle className="h-4 w-4" /></a>}
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Progress ── */}
      {isVisible("ov-progress") && online && (
        <section className={cn(CARD, "px-5 py-4")}>
          {st === "Canceled" ? (
            <div className="flex items-start gap-3 text-red-700">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50"><Ban className="h-5 w-5" /></span>
              <div><p className="font-semibold">Order canceled</p>{order.cancelReason && <p className="text-sm text-red-600">Reason: {order.cancelReason}</p>}</div>
            </div>
          ) : (
            <ol className="flex items-center">
              {STEPS.map((s, i) => {
                const done = i <= stepIndex;
                return (
                  <li key={s.key} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
                    <span className="flex flex-col items-center gap-1.5">
                      <span className={cn("grid h-9 w-9 place-items-center rounded-full border-2", done ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-admin-gray-200 bg-white text-admin-gray-400")}>
                        {done && i < stepIndex ? <Check className="h-4 w-4" strokeWidth={3} /> : <s.icon className="h-4 w-4" />}
                      </span>
                      <span className={cn("whitespace-nowrap text-xs font-semibold", done ? "text-admin-gray-900" : "text-admin-gray-400")}>{s.label}</span>
                    </span>
                    {i < STEPS.length - 1 && <span className={cn("mx-2 mb-5 h-0.5 flex-1 rounded", i < stepIndex ? "bg-[#2563eb]" : "bg-admin-gray-200")} />}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Left: items, bill, history ── */}
        <div className="min-w-0 space-y-4">
          {isVisible("ov-items") && (
            <section className={CARD}>
              <div className="flex items-center justify-between border-b border-admin-gray-100 px-4 py-3">
                <h3 className="flex items-center gap-2 font-semibold text-admin-gray-900"><Package className="h-4 w-4 text-[#2563eb]" />Items <span className="font-normal text-admin-gray-400">({items.length})</span></h3>
                {order.locked && <span className="flex items-center gap-1 text-xs text-admin-gray-500"><Lock className="h-3.5 w-3.5" />Delivered — can&apos;t be edited</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead className="bg-[#f8f9fb]">
                    <tr>
                      {show("ov-items", "ov-c-num") && <th className={cn(th, "w-10")}>#</th>}
                      {show("ov-items", "ov-c-product") && <th className={th}>Product</th>}
                      {show("ov-items", "ov-c-qty") && <th className={cn(th, "w-[130px]")}>Qty</th>}
                      {show("ov-items", "ov-c-price") && <th className={cn(th, "text-right")}>Price</th>}
                      {show("ov-items", "ov-c-gst") && <th className={cn(th, "text-right")}>GST</th>}
                      {show("ov-items", "ov-c-subtotal") && <th className={cn(th, "text-right")}>Amount</th>}
                      {editable && show("ov-items", "ov-c-remove") && <th className={cn(th, "w-12")} />}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.id} className="hover:bg-[#f8f9fe]">
                        {show("ov-items", "ov-c-num") && <td className={cn(td, "text-admin-gray-400")}>{i + 1}</td>}
                        {show("ov-items", "ov-c-product") && (
                          <td className={td}>
                            <div className="flex items-center gap-3">
                              {show("ov-items", "ov-c-image") && (
                                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-admin-gray-200 bg-admin-gray-50">
                                  {it.image
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={/^(https?:|\/)/.test(it.image) ? it.image : `/${it.image}`} alt="" className="h-full w-full object-cover" loading="lazy" />
                                    : <Package className="h-4 w-4 text-admin-gray-300" />}
                                </span>
                              )}
                              <span className="min-w-0 font-medium text-admin-gray-900">{it.productName}</span>
                            </div>
                          </td>
                        )}
                        {show("ov-items", "ov-c-qty") && (
                          <td className={td}>{editable ? <QtyEditor initialQty={it.qty} busy={busy} onSubmit={(qty) => callItemsApi({ action: "update_qty", itemId: it.id, qty })} /> : <span className="font-medium">× {it.qty}</span>}</td>
                        )}
                        {show("ov-items", "ov-c-price") && <td className={cn(td, "text-right text-admin-gray-700")}>{money(it.price)}</td>}
                        {show("ov-items", "ov-c-gst") && <td className={cn(td, "text-right text-admin-gray-500")}>{it.gstRate ? `${it.gstRate}%` : "—"}</td>}
                        {show("ov-items", "ov-c-subtotal") && <td className={cn(td, "text-right font-semibold text-admin-gray-900")}>{money(it.price * it.qty)}</td>}
                        {editable && show("ov-items", "ov-c-remove") && (
                          <td className={td}>
                            <button type="button" disabled={busy} title="Remove from order"
                              onClick={() => { if (confirm("Remove this item from the order?")) callItemsApi({ action: "remove_item", itemId: it.id }); }}
                              className="grid h-8 w-8 place-items-center rounded-[8px] text-red-500 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {editable && show("ov-items", "ov-i-add") && (
                <div className="flex flex-wrap items-center gap-2 border-t border-admin-gray-100 px-4 py-3">
                  <span className="text-sm font-medium text-admin-gray-700">Add a product</span>
                  <select value={addProductId} onChange={(e) => setAddProductId(e.target.value)} aria-label="Product to add" className="h-9 min-w-[220px] flex-1 rounded-[8px] border border-admin-gray-200 bg-white pl-3 text-sm">
                    <option value="">Choose a product…</option>
                    {availableProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""} — {money(p.price)}</option>)}
                  </select>
                  <Stepper value={addQty} onChange={setAddQty} />
                  <button type="button" disabled={busy || !addProductId} onClick={async () => { if (await callItemsApi({ action: "add_item", productId: Number(addProductId), addQty })) { setAddProductId(""); setAddQty(1); } }}
                    className="flex h-9 items-center gap-1.5 rounded-[8px] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"><Plus className="h-4 w-4" />Add</button>
                </div>
              )}

              {isVisible("ov-bill") && (
                <div className="flex justify-end border-t border-admin-gray-100 px-4 py-3">
                  <dl className="w-full max-w-[320px] space-y-1.5 text-sm">
                    {show("ov-bill", "ov-b-subtotal") && <BillRow k="Subtotal" v={money(subtotal)} />}
                    {show("ov-bill", "ov-b-discount") && (order.discount ?? 0) > 0 && <BillRow k="Discount" v={`− ${money(order.discount ?? 0)}`} tone="text-emerald-700" />}
                    {show("ov-bill", "ov-b-gst") && (order.gst ?? 0) > 0 && <BillRow k="GST" v={money(order.gst ?? 0)} />}
                    <div className="flex justify-between border-t border-admin-gray-200 pt-2 text-base font-bold text-admin-gray-900"><dt>Total</dt><dd>{money(order.totalAmount)}</dd></div>
                    {show("ov-bill", "ov-b-paid") && <BillRow k="Paid" v={money(paidAmount)} />}
                    {show("ov-bill", "ov-b-due") && (due > 0.004 ? <BillRow k="Due" v={money(due)} tone="font-bold text-red-600" /> : <p className="text-right text-xs font-bold uppercase tracking-wide text-emerald-600">✓ Fully paid</p>)}
                  </dl>
                </div>
              )}
            </section>
          )}

          {isVisible("ov-history") && events.length > 0 && (
            <section className={cn(CARD, "p-4")}>
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-admin-gray-900"><History className="h-4 w-4 text-[#2563eb]" />Order history</h3>
              <ol className="relative ml-2 border-l-2 border-admin-gray-100">
                {events.slice().reverse().map((e) => (
                  <li key={e.id} className="relative mb-3.5 pl-5 last:mb-0">
                    <span className={cn("absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-white",
                      e.type === "payment" ? "bg-emerald-500" : e.type === "assign" ? "bg-sky-500" : e.to === "Canceled" ? "bg-red-500" : e.type === "note" ? "bg-amber-400" : "bg-[#2563eb]")} />
                    <p className="text-sm font-medium text-admin-gray-800">{eventText(e)}</p>
                    {e.note && <p className="text-sm text-admin-gray-600">{e.note}</p>}
                    <p className="text-xs text-admin-gray-400">{when(e.at)} · {e.actor}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {/* ── Right: next steps, customer, address, payment ── */}
        <div className="space-y-4">
          {show("ov-side", "ov-s-actions") && !order.locked && st !== "Canceled" && (
            <section className={cn(CARD, "space-y-3 p-4")}>
              <h3 className="font-semibold text-admin-gray-900">Next step</h3>
              {st === "Pending" && perms.accept && (
                <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-sm font-semibold text-amber-800">New order — accept or reject it</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy} onClick={() => callStatusApi({ action: "update_status", orderStatus: "In Progress" })}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><Check className="h-4 w-4" />Accept</button>
                    <button type="button" disabled={busy} onClick={() => { setReasonFor("reject"); setReason(""); }}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-red-300 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"><X className="h-4 w-4" />Reject</button>
                  </div>
                </div>
              )}

              {online && (perms.assign || order.agent) && (
                <div className="rounded-[8px] border border-admin-gray-200 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-admin-gray-800"><Bike className="h-4 w-4 text-sky-600" />Delivery agent</p>
                  {order.agent && <p className="mb-2 text-sm text-admin-gray-600"><b className="text-admin-gray-900">{order.agent.name}</b>{order.agent.assignedAt && <span className="text-xs text-admin-gray-400"> · since {when(order.agent.assignedAt)}</span>}</p>}
                  {perms.assign && (agents.length === 0
                    ? <p className="text-xs text-admin-gray-500">No delivery agents yet — add a staff member with the <b>Delivery Agent</b> role.</p>
                    : (
                      <div className="flex gap-2">
                        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Delivery agent" className="h-9 min-w-0 flex-1 rounded-[8px] border border-admin-gray-200 bg-white pl-2.5 text-sm">
                          <option value="">— Not assigned —</option>
                          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <button type="button" disabled={busy || agentId === String(order.agent?.id ?? "")} onClick={() => callStatusApi({ action: "assign", agentId: agentId ? Number(agentId) : null })}
                          className="h-9 rounded-[8px] bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{order.agent ? "Change" : "Assign"}</button>
                      </div>
                    ))}
                  {perms.assign && agents.length > 0 && !order.agent && st !== "Pending" && <p className="mt-1.5 text-xs text-admin-gray-500">Assigning sends it Out for Delivery.</p>}
                </div>
              )}

              {!paid && perms.pay && st !== "Pending" && (
                <div className="rounded-[8px] border border-admin-gray-200 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-admin-gray-800"><Banknote className="h-4 w-4 text-emerald-600" />Collect {money(order.totalAmount)}</p>
                  <div className="flex gap-2">
                    <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} aria-label="Paid by" className="h-9 min-w-0 flex-1 rounded-[8px] border border-admin-gray-200 bg-white pl-2.5 text-sm">
                      {["Cash", "UPI", "Card", "Other"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                    <button type="button" disabled={busy} onClick={() => callStatusApi({ action: "update_payment", paymentStatus: "Paid", method: payMethod })}
                      className="h-9 rounded-[8px] bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Mark Paid</button>
                  </div>
                </div>
              )}

              {perms.status && st === "In Progress" && (
                <button type="button" disabled={busy || (online && agents.length > 0 && !order.agent)} onClick={() => callStatusApi({ action: "update_status", orderStatus: "Out for Delivery" })}
                  title={online && agents.length > 0 && !order.agent ? "Assign a delivery agent first" : undefined}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#2563eb] text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"><Truck className="h-4 w-4" />Send out for delivery</button>
              )}
              {perms.status && (st === "Out for Delivery" || (st === "In Progress" && !online)) && (
                <>
                  <button type="button" disabled={busy || !paid} onClick={() => callStatusApi({ action: "update_status", orderStatus: "Delivered" })}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><PackageCheck className="h-4 w-4" />Mark delivered</button>
                  {!paid && <p className="flex items-start gap-1.5 text-xs text-amber-700"><CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />Collect the payment first — then it can be marked Delivered.</p>}
                </>
              )}
              {perms.cancel && st !== "Pending" && (
                <button type="button" disabled={busy} onClick={() => { setReasonFor("cancel"); setReason(""); }} className="w-full text-center text-xs font-semibold text-red-600 hover:underline">Cancel this order</button>
              )}
              {(perms.status || perms.pay) && (
                <div className="border-t border-admin-gray-100 pt-2">
                  <button type="button" onClick={() => setMore((v) => !v)} className="flex w-full items-center justify-between text-xs font-semibold text-admin-gray-500">
                    Change status / payment by hand <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", more && "rotate-180")} />
                  </button>
                  {more && <p className="mt-1.5 text-xs text-admin-gray-500">Use the status and payment pills at the top of the page.</p>}
                </div>
              )}
            </section>
          )}

          {show("ov-side", "ov-s-customer") && (
            <section className={cn(CARD, "p-4")}>
              <h3 className="mb-3 font-semibold text-admin-gray-900">Customer</h3>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-100 font-bold text-violet-700">{order.customerName.trim().charAt(0).toUpperCase() || <UserRound className="h-5 w-5" />}</span>
                <div className="min-w-0">
                  {order.customerId
                    ? <Link href={`/admin/ecommerce/customers/${order.customerId}`} className="block truncate font-semibold text-admin-gray-900 hover:text-[#2563eb] hover:underline">{order.customerName || "Customer"}</Link>
                    : <p className="truncate font-semibold text-admin-gray-900">{order.customerName || "Walk-in customer"}</p>}
                  {order.customerId && <Link href={`/admin/ecommerce/customers/${order.customerId}`} className="text-xs text-[#2563eb] hover:underline">View profile</Link>}
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-admin-gray-700">
                <Row icon={Phone}>{order.customerPhone ? <a href={`tel:${order.customerPhone}`} className="hover:underline">{order.customerPhone}</a> : <span className="text-admin-gray-400">No phone</span>}</Row>
                <Row icon={Mail}>{order.customerEmail ? <a href={`mailto:${order.customerEmail}`} className="break-all hover:underline">{order.customerEmail}</a> : <span className="text-admin-gray-400">No email</span>}</Row>
              </div>
            </section>
          )}

          {show("ov-side", "ov-s-address") && online && (
            <section className={cn(CARD, "overflow-hidden")}>
              <div className="p-4">
                <h3 className="mb-2 font-semibold text-admin-gray-900">Delivery address</h3>
                <p className="whitespace-pre-line text-sm text-admin-gray-700">{order.shippingAddress || "—"}</p>
                {order.mapUrl
                  ? <a href={order.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-2.5 inline-flex items-center gap-1.5 rounded-[8px] bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><MapPin className="h-3.5 w-3.5" />Open in Google Maps<ExternalLink className="h-3 w-3" /></a>
                  : <p className="mt-2 text-xs text-admin-gray-400">The customer didn&apos;t share a map location.</p>}
              </div>
              {show("ov-side", "ov-s-map") && order.lat != null && order.lng != null && (
                <iframe title="Delivery location" loading="lazy" className="h-44 w-full border-0 border-t border-admin-gray-100"
                  src={`https://maps.google.com/maps?q=${order.lat},${order.lng}&z=16&output=embed`} />
              )}
            </section>
          )}

          {show("ov-side", "ov-s-payment") && (
            <section className={cn(CARD, "p-4")}>
              <h3 className="mb-3 font-semibold text-admin-gray-900">Payment</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-admin-gray-500">Method</span><span className="flex items-center gap-1.5 font-medium text-admin-gray-800"><CreditCard className="h-3.5 w-3.5 text-admin-gray-400" />{order.paymentMethod || "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-admin-gray-500">Status</span><StatusBadge variant={paymentStatusVariant(order.paymentStatus)}>{order.paymentStatus}</StatusBadge></div>
                <div className="flex items-center justify-between"><span className="text-admin-gray-500">Paid</span><span className="font-medium">{money(paidAmount)}</span></div>
                {due > 0.004 && (
                  <div className="flex items-center justify-between"><span className="text-admin-gray-500">Due</span><span className="font-bold text-red-600">{money(due)}</span></div>
                )}
                {order.dueBalance > 0.004 && <Link href="/admin/ecommerce/due" className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100"><ReceiptText className="h-4 w-4" />Collect due</Link>}
                {order.duePaymentCount > 0 && <p className="text-xs text-admin-gray-500">{order.duePaymentCount} due payment{order.duePaymentCount === 1 ? "" : "s"} recorded — see the invoice.</p>}
                {paid && due <= 0.004 && <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Fully paid</p>}
              </div>
            </section>
          )}
        </div>
      </div>

      {reasonFor && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setReasonFor(null)}>
          <div className="w-full max-w-md rounded-[10px] bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h5 className="mb-1 text-lg font-bold">{reasonFor === "reject" ? "Reject this order?" : "Cancel this order?"}</h5>
            <p className="mb-3 text-sm text-admin-gray-500">The stock goes back on the shelf. Tell the reason (the customer can see it in their order).</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {["Out of stock", "Can't deliver to this address", "Customer asked to cancel", "Payment issue"].map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-[6px] border px-2.5 py-1 text-xs", reason === r ? "border-red-400 bg-red-50 text-red-700" : "border-admin-gray-200")}>{r}</button>
              ))}
            </div>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="w-full rounded-[8px] border border-admin-gray-200 px-3 py-2 text-sm" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setReasonFor(null)} className="h-9 rounded-[8px] bg-admin-gray-100 px-4 text-sm">Back</button>
              <button type="button" disabled={busy || reason.trim().length < 3} onClick={async () => { await callStatusApi({ action: "update_status", orderStatus: "Canceled", note: reason.trim() }); setReasonFor(null); }}
                className="flex h-9 items-center gap-1.5 rounded-[8px] bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" />{reasonFor === "reject" ? "Reject order" : "Cancel order"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return <div className="flex items-start gap-2.5"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-admin-gray-400" /><span className="min-w-0">{children}</span></div>;
}

function BillRow({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return <div className={cn("flex justify-between", tone)}><dt className="text-admin-gray-500">{k}</dt><dd className="font-medium">{v}</dd></div>;
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="inline-flex h-9 items-center rounded-[8px] border border-admin-gray-200 bg-white">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Less" className="grid h-full w-8 place-items-center text-admin-gray-500 hover:bg-admin-gray-50"><Minus className="h-3.5 w-3.5" /></button>
      <input type="number" min={1} value={value} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))} aria-label="Quantity" className="h-full w-11 border-x border-admin-gray-200 text-center text-sm outline-none" />
      <button type="button" onClick={() => onChange(value + 1)} aria-label="More" className="grid h-full w-8 place-items-center text-admin-gray-500 hover:bg-admin-gray-50"><Plus className="h-3.5 w-3.5" /></button>
    </span>
  );
}

/** Quantity stepper that saves when changed. */
function QtyEditor({ initialQty, busy, onSubmit }: { initialQty: number; busy: boolean; onSubmit: (qty: number) => void }) {
  const [qty, setQty] = useState(initialQty);
  useEffect(() => setQty(initialQty), [initialQty]);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Stepper value={qty} onChange={setQty} />
      {qty !== initialQty && (
        <button type="button" disabled={busy} onClick={() => onSubmit(qty)} className="h-9 rounded-[8px] bg-[#2563eb] px-2.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">Save</button>
      )}
    </span>
  );
}
