"use client";

import { useState } from "react";
import { StatusPill } from "@/components/admin/ui/buttons";
import { orderStatusVariant } from "@/components/admin/StatusDropdown";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Mail, MapPin, CreditCard, RefreshCw, Trash2, FileText, Lock, Check, X, Truck, Bike, Banknote, PackageCheck, History, ChevronDown, CircleAlert, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORDER_STATUSES } from "@/lib/order-statuses";

export interface OrderDetailItem {
  id: number;
  productName: string;
  qty: number;
  price: number;
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
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
function eventText(e: OrderEventRow): string {
  if (e.type === "placed") return "Order placed by the customer";
  if (e.type === "assign") return e.to ? `Assigned to ${e.to}${e.from ? ` (was ${e.from})` : ""}` : `Delivery agent ${e.from ?? ""} removed`;
  if (e.type === "payment") return `Payment ${e.from ?? "?"} → ${e.to ?? "?"}`;
  if (e.type === "note") return "Note";
  if (e.type === "status") return e.from === "Pending" && e.to === "In Progress" ? "Order accepted" : e.from === "Pending" && e.to === "Canceled" ? "Order rejected" : `Status ${e.from ?? "?"} → ${e.to ?? "?"}`;
  return e.type;
}

export function OrderDetailView({ order, items, availableProducts, perms = ALL, agents = [], events = [] }: OrderDetailViewProps) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [agentId, setAgentId] = useState(order.agent ? String(order.agent.id) : "");
  const [payMethod, setPayMethod] = useState("Cash");
  const [reasonFor, setReasonFor] = useState<null | "reject" | "cancel">(null);
  const [reason, setReason] = useState("");
  const [more, setMore] = useState(false);
  const online = order.orderType !== "offline";
  const st = order.orderStatus, paid = order.paymentStatus === "Paid";

  async function callStatusApi(body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/ecommerce/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setNotice({ type: data.success ? "success" : "error", message: data.message });
      if (data.success) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function callItemsApi(body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/ecommerce/orders/${order.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setNotice({ type: data.success ? "success" : "error", message: data.message });
      if (data.success) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
      {/* LEFT: items */}
      <div className="space-y-4">
        {notice && (
          <div className={cn("text-sm rounded px-4 py-2.5", notice.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700")}>
            {notice.message}
          </div>
        )}

        {order.locked && (
          <div className="flex items-center gap-2 bg-admin-gray-100 text-admin-gray-600 text-sm rounded px-4 py-2.5">
            <Lock className="w-4 h-4" /> This order is Delivered and can no longer be edited.
          </div>
        )}

        <div className="bg-white rounded-card border border-card shadow-card p-5">
          <h5 className="font-bold mb-3">Order Items</h5>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-gray-200 text-left">
                  <th className="py-2">Product</th>
                  <th className="py-2">Qty</th>
                  <th className="py-2">Price</th>
                  <th className="py-2">Due</th>
                  <th className="py-2">Subtotal</th>
                  <th className="py-2">Invoice</th>
                  {!order.locked && perms.editItems && <th className="py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} className="border-b border-admin-gray-100">
                    <td className="py-2.5">{it.productName}</td>
                    <td className="py-2.5">
                      {order.locked || !perms.editItems ? (
                        it.qty
                      ) : (
                        <QtyEditor itemId={it.id} initialQty={it.qty} busy={busy} onSubmit={(qty) => callItemsApi({ action: "update_qty", itemId: it.id, qty })} />
                      )}
                    </td>
                    <td className="py-2.5">₹{it.price.toFixed(2)}</td>
                    {i === 0 && (
                      <td className="py-2.5" rowSpan={items.length}>
                        {order.dueBalance > 0.004 ? (
                          <div>
                            <span className="inline-block bg-red-500 text-white text-xs font-semibold rounded px-2 py-1">Due: ₹{order.dueBalance.toFixed(2)}</span>
                            <div className="mt-1">
                              <Link href={`/admin/ecommerce/due`} className="text-xs bg-admin-primary text-white rounded px-2 py-1 inline-block">Pay Due</Link>
                            </div>
                          </div>
                        ) : order.linkedCreditId ? (
                          <span className="inline-block bg-admin-status-success text-white text-xs font-semibold rounded px-2 py-1">Paid: ₹{order.totalAmount.toFixed(2)}</span>
                        ) : (
                          <span className="text-admin-gray-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-2.5">₹{(it.price * it.qty).toFixed(2)}</td>
                    {i === 0 && (
                      <td className="py-2.5" rowSpan={items.length}>
                        <Link
                          href={`/admin/ecommerce/invoice/${order.id}`}
                          target="_blank"
                          className="flex items-center gap-1 bg-admin-gray-100 hover:bg-admin-gray-200 text-xs font-medium rounded px-2.5 py-1.5 w-fit"
                        >
                          <FileText className="w-3.5 h-3.5" /> {order.duePaymentCount > 0 ? `×${order.duePaymentCount + 1}` : ""}
                        </Link>
                      </td>
                    )}
                    {!order.locked && perms.editItems && (
                      <td className="py-2.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (confirm("Remove this item from the order?")) callItemsApi({ action: "remove_item", itemId: it.id });
                          }}
                          className="w-[34px] h-[34px] inline-flex items-center justify-center p-0 rounded text-white transition-opacity hover:opacity-85" style={{ backgroundColor: "#ef4444" }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!order.locked && perms.editItems && (
            <>
              <hr className="my-4 border-admin-gray-100" />
              <h6 className="font-semibold mb-2 text-sm">Add a Product to this Order</h6>
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <select value={addProductId} onChange={(e) => setAddProductId(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                    <option value="">Select a product</option>
                    {availableProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ""} — ₹{p.price.toFixed(2)}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="number"
                  min={1}
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  className="w-20 border border-admin-gray-200 rounded px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || !addProductId}
                  onClick={() => callItemsApi({ action: "add_item", productId: Number(addProductId), addQty: Number(addQty) })}
                  className="bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-4 py-2 disabled:opacity-60"
                >
                  Add
                </button>
              </div>
            </>
          )}
        </div>

        {events.length > 0 && (
          <div className="bg-white rounded-card border border-card shadow-card p-5">
            <h5 className="mb-3 flex items-center gap-2 font-bold"><History className="h-4 w-4 text-admin-primary" />Order History</h5>
            <ol className="relative ml-2 border-l-2 border-admin-gray-100">
              {events.slice().reverse().map((e) => (
                <li key={e.id} className="relative mb-3.5 pl-5 last:mb-0">
                  <span className={cn("absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-white",
                    e.type === "payment" ? "bg-emerald-500" : e.type === "assign" ? "bg-sky-500" : e.to === "Canceled" ? "bg-red-500" : e.type === "note" ? "bg-amber-400" : "bg-admin-primary")} />
                  <p className="text-sm font-medium text-admin-gray-800">{eventText(e)}</p>
                  {e.note && <p className="text-sm text-admin-gray-600">{e.note}</p>}
                  <p className="text-xs text-admin-gray-400">{when(e.at)} · {e.actor}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* RIGHT: summary */}
      <div className="bg-white rounded-card border border-card shadow-card p-5 h-fit">
        <div className="text-center pb-4 mb-4 border-b border-admin-gray-100">
          <div className="text-[1.05rem] font-bold text-admin-gray-900">{order.orderNumber}</div>
          <div className="text-[1.75rem] font-extrabold text-admin-primary mt-0.5">₹{order.totalAmount.toFixed(2)}</div>
        </div>

        <div className="flex justify-center gap-1.5 mb-4">
          <span className={cn("text-xs font-bold rounded-full px-3 py-1", order.paymentStatus === "Paid" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>
            {order.paymentStatus}
          </span>
          <span className="text-xs font-bold rounded-full px-3 py-1 bg-sky-100 text-sky-800">{order.orderStatus}</span>
        </div>

        {st === "Canceled" && order.cancelReason && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><b>Reason:</b> {order.cancelReason}</div>
        )}

        {!order.locked && st !== "Canceled" && (
          <div className="mb-4 space-y-3">
            {/* 1. New order → accept / reject */}
            {st === "Pending" && perms.accept && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="mb-2 text-sm font-semibold text-amber-800">New order — accept or reject it</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => callStatusApi({ action: "update_status", orderStatus: "In Progress" })}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><Check className="h-4 w-4" />Accept</button>
                  <button type="button" disabled={busy} onClick={() => { setReasonFor("reject"); setReason(""); }}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-red-300 bg-white py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"><X className="h-4 w-4" />Reject</button>
                </div>
              </div>
            )}

            {/* 2. Delivery agent */}
            {online && st !== "Pending" && (perms.assign || order.agent) && (
              <div className="rounded-lg border border-admin-gray-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-admin-gray-800"><Bike className="h-4 w-4 text-sky-600" />Delivery agent</p>
                {order.agent && <p className="mb-2 text-sm text-admin-gray-600"><b className="text-admin-gray-900">{order.agent.name}</b>{order.agent.assignedAt && <span className="text-xs text-admin-gray-400"> · since {when(order.agent.assignedAt)}</span>}</p>}
                {perms.assign && (agents.length === 0
                  ? <p className="text-xs text-admin-gray-500">No delivery agents yet — add a user with the <b>Delivery Agent</b> role in Users.</p>
                  : (
                    <div className="flex gap-2">
                      <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="min-w-0 flex-1 rounded border border-admin-gray-200 px-2.5 py-2 text-sm">
                        <option value="">— Not assigned —</option>
                        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <button type="button" disabled={busy || agentId === String(order.agent?.id ?? "")} onClick={() => callStatusApi({ action: "assign", agentId: agentId ? Number(agentId) : null })}
                        className="rounded bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{order.agent ? "Change" : "Assign"}</button>
                    </div>
                  ))}
              </div>
            )}

            {/* 3. Payment (Cash on Delivery is collected before delivery) */}
            {!paid && perms.pay && st !== "Pending" && (
              <div className="rounded-lg border border-admin-gray-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-admin-gray-800"><Banknote className="h-4 w-4 text-emerald-600" />Payment not received — ₹{order.totalAmount.toFixed(2)}</p>
                <div className="flex gap-2">
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="min-w-0 flex-1 rounded border border-admin-gray-200 px-2.5 py-2 text-sm">
                    {["Cash", "UPI", "Card", "Other"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <button type="button" disabled={busy} onClick={() => callStatusApi({ action: "update_payment", paymentStatus: "Paid", method: payMethod })}
                    className="rounded bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Mark Paid</button>
                </div>
              </div>
            )}

            {/* 4. Next step */}
            {perms.status && st === "In Progress" && (
              <button type="button" disabled={busy || (online && agents.length > 0 && !order.agent)} onClick={() => callStatusApi({ action: "update_status", orderStatus: "Out for Delivery" })}
                title={online && agents.length > 0 && !order.agent ? "Assign a delivery agent first" : undefined}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-admin-primary py-2.5 text-sm font-semibold text-white hover:bg-admin-primary-dark disabled:opacity-50"><Truck className="h-4 w-4" />Send Out for Delivery</button>
            )}
            {perms.status && (st === "Out for Delivery" || (st === "In Progress" && !online)) && (
              <>
                <button type="button" disabled={busy || !paid} onClick={() => callStatusApi({ action: "update_status", orderStatus: "Delivered" })}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><PackageCheck className="h-4 w-4" />Mark Delivered</button>
                {!paid && <p className="flex items-start gap-1.5 text-xs text-amber-700"><CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />Collect the payment and mark it Paid first — then it can be marked Delivered.</p>}
              </>
            )}
            {perms.cancel && st !== "Pending" && (
              <button type="button" disabled={busy} onClick={() => { setReasonFor("cancel"); setReason(""); }} className="w-full text-center text-xs font-semibold text-red-600 hover:underline">Cancel this order</button>
            )}

            {(perms.status || perms.pay) && (
              <div className="border-t border-admin-gray-100 pt-2">
                <button type="button" onClick={() => setMore((v) => !v)} className="flex w-full items-center justify-between text-xs font-semibold text-admin-gray-500">
                  Set status / payment manually <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", more && "rotate-180")} />
                </button>
                {more && (
                  <div className="mt-2 space-y-2">
                    {perms.status && (
                      <div className="flex items-center justify-between gap-2 text-sm text-admin-gray-600">
                        Order status
                        <StatusPill label={`Change order status for ${order.orderNumber}`} value={st} disabled={busy}
                          options={ORDER_STATUSES.map((v) => ({ value: v, label: v, variant: orderStatusVariant(v) }))}
                          onChange={(next) => (next === "Canceled" ? (setReasonFor("cancel"), setReason("")) : callStatusApi({ action: "update_status", orderStatus: next }))} />
                      </div>
                    )}
                    {perms.pay && (
                      <div className="flex items-center justify-between gap-2 text-sm text-admin-gray-600">
                        Payment
                        <StatusPill label={`Change payment status for ${order.orderNumber}`} value={paid ? "Paid" : "Unpaid"} disabled={busy}
                          options={[{ value: "Paid", label: "Paid", variant: "success" }, { value: "Unpaid", label: "Unpaid", variant: "secondary" }]}
                          onChange={(next) => callStatusApi({ action: "update_payment", paymentStatus: next })} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {reasonFor && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setReasonFor(null)}>
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h5 className="mb-1 text-lg font-bold">{reasonFor === "reject" ? "Reject this order?" : "Cancel this order?"}</h5>
              <p className="mb-3 text-sm text-admin-gray-500">The stock goes back on the shelf. Tell the reason (the customer can see it in their order).</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {["Out of stock", "Can't deliver to this address", "Customer asked to cancel", "Payment issue"].map((r) => (
                  <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-full border px-2.5 py-1 text-xs", reason === r ? "border-red-400 bg-red-50 text-red-700" : "border-admin-gray-200")}>{r}</button>
                ))}
              </div>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="w-full rounded border border-admin-gray-200 px-3 py-2 text-sm" />
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setReasonFor(null)} className="rounded bg-admin-gray-100 px-4 py-2 text-sm">Back</button>
                <button type="button" disabled={busy || reason.trim().length < 3} onClick={async () => { await callStatusApi({ action: "update_status", orderStatus: "Canceled", note: reason.trim() }); setReasonFor(null); }}
                  className="flex items-center gap-1.5 rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" />{reasonFor === "reject" ? "Reject order" : "Cancel order"}</button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-admin-gray-100 pt-3 space-y-1">
          <SummaryRow icon={<Phone className="w-4 h-4" />} text={order.customerPhone || "—"} />
          <SummaryRow icon={<Mail className="w-4 h-4" />} text={order.customerEmail || "—"} />
          <SummaryRow icon={<MapPin className="w-4 h-4" />} text={order.shippingAddress || "—"} />
          {order.mapUrl && (
            <a href={order.mapUrl} target="_blank" rel="noopener noreferrer"
              className="ml-[26px] inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
              <MapPin className="h-3.5 w-3.5" /> Open delivery location in Google Maps
            </a>
          )}
          <SummaryRow icon={<CreditCard className="w-4 h-4" />} text={order.paymentMethod || "—"} />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2 text-sm text-admin-gray-700">
      <span className="text-admin-gray-400 mt-0.5 shrink-0">{icon}</span>
      <span className="whitespace-pre-line">{text}</span>
    </div>
  );
}

function QtyEditor({ itemId, initialQty, busy, onSubmit }: { itemId: number; initialQty: number; busy: boolean; onSubmit: (qty: number) => void }) {
  const [qty, setQty] = useState(String(initialQty));
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="w-16 border border-admin-gray-200 rounded px-2 py-1 text-sm"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => onSubmit(Math.max(1, Number(qty) || 1))}
        className="w-7 h-7 flex items-center justify-center bg-admin-gray-100 hover:bg-admin-gray-200 rounded"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
