"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Mail, MapPin, CreditCard, RefreshCw, Trash2, FileText, Lock } from "lucide-react";
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
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  totalAmount: number;
  locked: boolean;
  dueBalance: number;
  duePaymentCount: number;
  linkedCreditId: number | null;
}

interface OrderDetailViewProps {
  order: OrderDetailData;
  items: OrderDetailItem[];
  availableProducts: { id: number; name: string; sku: string | null; price: number }[];
}

export function OrderDetailView({ order, items, availableProducts }: OrderDetailViewProps) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [orderStatus, setOrderStatus] = useState(order.orderStatus);
  const [paymentStatus, setPaymentStatus] = useState(order.paymentStatus);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [busy, setBusy] = useState(false);

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
                  {!order.locked && <th className="py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} className="border-b border-admin-gray-100">
                    <td className="py-2.5">{it.productName}</td>
                    <td className="py-2.5">
                      {order.locked ? (
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
                    {!order.locked && (
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

          {!order.locked && (
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

        {!order.locked && (
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-medium mb-1">Order Status</label>
              <div className="flex gap-2">
                <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className="flex-1 border border-admin-gray-200 rounded px-3 py-2 text-sm">
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => callStatusApi({ action: "update_status", orderStatus })}
                  className="bg-admin-primary hover:bg-admin-primary-dark text-white text-sm rounded px-3 py-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Payment Status</label>
              <div className="flex gap-2">
                <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="flex-1 border border-admin-gray-200 rounded px-3 py-2 text-sm">
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => callStatusApi({ action: "update_payment", paymentStatus })}
                  className="bg-admin-primary hover:bg-admin-primary-dark text-white text-sm rounded px-3 py-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-admin-gray-100 pt-3 space-y-1">
          <SummaryRow icon={<Phone className="w-4 h-4" />} text={order.customerPhone || "—"} />
          <SummaryRow icon={<Mail className="w-4 h-4" />} text={order.customerEmail || "—"} />
          <SummaryRow icon={<MapPin className="w-4 h-4" />} text={order.shippingAddress || "—"} />
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
      <span>{text}</span>
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
