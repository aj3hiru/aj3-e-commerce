"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, HandCoins, Save, MapPin, ExternalLink, KeyRound, Smartphone } from "lucide-react";

export interface CustomerProfileData {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  customerType: string;
  status: string;
}

export interface CustomerOrderRow {
  id: number;
  orderNumber: string;
  totalAmount: number;
  paymentStatus: string;
  orderStatus: string;
  createdAt: string;
}

export interface CustomerCreditRow {
  id: number;
  orderNumber: string | null;
  amount: number;
  amountPaid: number;
  status: string;
  createdAt: string;
  payments: { paymentMethod: string; amount: number; createdAt: string }[];
}

export interface CustomerAddressRow {
  id: number; name: string; phone: string; text: string; type: string; isDefault: boolean; mapUrl: string | null;
}

interface CustomerProfileViewProps {
  customer: CustomerProfileData;
  addresses?: CustomerAddressRow[];
  login?: { hasPassword: boolean; email: boolean; phone: boolean };
  orders: CustomerOrderRow[];
  credits: CustomerCreditRow[];
  totalSpent: number;
  totalOrders: number;
}

const fmt = (n: number) => n.toFixed(2);

/** Verified against admin/ecommerce/customer-profile.php. */
export function CustomerProfileView({ customer, orders, credits, totalSpent, totalOrders, addresses = [], login }: CustomerProfileViewProps) {
  const router = useRouter();
  const [form, setForm] = useState(customer);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/ecommerce/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setNotice({ type: data.success ? "success" : "error", message: data.success ? "Profile updated successfully!" : data.message });
      if (data.success) router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const totalDue = credits.reduce((s, c) => s + Math.max(0, c.amount - c.amountPaid), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
      {/* LEFT: edit form + stats */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
            <div className="text-xl font-bold text-admin-gray-900">{totalOrders}</div>
            <div className="text-xs text-admin-gray-500 mt-1">Total Orders</div>
          </div>
          <div className="bg-white rounded-lg border border-admin-gray-200 p-4 text-center">
            <div className="text-xl font-bold text-emerald-600">₹{fmt(totalSpent)}</div>
            <div className="text-xs text-admin-gray-500 mt-1">Total Spent</div>
          </div>
        </div>
        {totalDue > 0.004 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <div className="text-xl font-bold text-red-600">₹{fmt(totalDue)}</div>
            <div className="text-xs text-red-500 mt-1">Outstanding Due</div>
          </div>
        )}

        {login && customer.customerType === "online" && (
          <div className="bg-white rounded-lg border border-admin-gray-200 p-4">
            <h5 className="font-bold mb-2 text-sm">Store login</h5>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {login.phone && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700"><Smartphone className="h-3.5 w-3.5" />Mobile OTP</span>}
              {login.hasPassword && <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700"><KeyRound className="h-3.5 w-3.5" />Password{login.email ? " (email / mobile)" : " (mobile)"}</span>}
              {!login.hasPassword && !login.phone && <span className="rounded-full bg-admin-gray-100 px-2.5 py-1 text-admin-gray-600">No login set up</span>}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
          <h5 className="font-bold mb-3">Saved Addresses <span className="font-normal text-admin-gray-400">({addresses.length})</span></h5>
          {addresses.length === 0 ? (
            <p className="text-sm text-admin-gray-500">No saved addresses yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {addresses.map((a) => (
                <li key={a.id} className={`rounded-lg border p-3 text-sm ${a.isDefault ? "border-violet-300 bg-violet-50/40" : "border-admin-gray-200"}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-admin-gray-800">{a.name}</span>
                    <span className="rounded bg-admin-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-admin-gray-600">{a.type}</span>
                    {a.isDefault && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700">Default</span>}
                  </div>
                  <p className="whitespace-pre-line text-admin-gray-600">{a.text}</p>
                  {a.mapUrl
                    ? <a href={a.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><MapPin className="h-3.5 w-3.5" />Open pinned location in Google Maps<ExternalLink className="h-3 w-3" /></a>
                    : <p className="mt-1.5 text-xs text-admin-gray-400">No map location pinned</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
          <h5 className="font-bold mb-3">Edit Customer</h5>
          {notice && (
            <div className={`text-sm rounded px-3 py-2 mb-3 ${notice.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {notice.message}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Name *</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Email</label>
              <input type="email" placeholder="Optional for mobile-OTP customers" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Phone</label>
              <input value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Address</label>
              <textarea rows={2} value={form.address ?? ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Customer Type</label>
              <select value={form.customerType} onChange={(e) => setForm((f) => ({ ...f, customerType: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                <option value="offline">Offline (Walk-in)</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-admin-primary hover:bg-admin-primary-dark text-white font-semibold rounded-lg py-2.5 disabled:opacity-60">
              <Save className="w-4 h-4" /> {submitting ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </div>

        <Link
          href={`/admin/ecommerce/billing?customer_id=${customer.id}`}
          className="block text-center bg-admin-gray-100 hover:bg-admin-gray-200 text-sm font-medium rounded-lg py-2.5"
        >
          Start New Order for this Customer
        </Link>
      </div>

      {/* RIGHT: orders + credits */}
      <div className="space-y-4">
        <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
          <h5 className="flex items-center gap-2 font-bold mb-3">
            <ShoppingBag className="w-4 h-4 text-admin-primary" /> Order History
          </h5>
          {orders.length === 0 ? (
            <p className="text-sm text-admin-gray-400">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-admin-gray-200 text-left">
                    <th className="py-2">Order #</th>
                    <th className="py-2">Total</th>
                    <th className="py-2">Payment</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-admin-gray-100">
                      <td className="py-2">
                        <Link href={`/admin/ecommerce/orders/${o.id}`} className="text-admin-primary font-medium">{o.orderNumber}</Link>
                      </td>
                      <td className="py-2">₹{fmt(o.totalAmount)}</td>
                      <td className="py-2">{o.paymentStatus}</td>
                      <td className="py-2">{o.orderStatus}</td>
                      <td className="py-2">{new Date(o.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
          <h5 className="flex items-center gap-2 font-bold mb-3">
            <HandCoins className="w-4 h-4 text-admin-primary" /> Due / Credit History
          </h5>
          {credits.length === 0 ? (
            <p className="text-sm text-admin-gray-400">No due history.</p>
          ) : (
            <div className="space-y-3">
              {credits.map((c) => {
                const balance = c.amount - c.amountPaid;
                return (
                  <div key={c.id} className="border border-admin-gray-100 rounded-lg p-3">
                    <div className="flex justify-between text-sm">
                      <span>{c.orderNumber ? <Link href={`/admin/ecommerce/invoice/${c.id}`} className="text-admin-primary">{c.orderNumber}</Link> : "General"}</span>
                      <span className={balance > 0.004 ? "text-red-600 font-bold" : "text-emerald-600 font-bold"}>
                        {balance > 0.004 ? `Due: ₹${fmt(balance)}` : "Fully Paid"}
                      </span>
                    </div>
                    <div className="text-xs text-admin-gray-400 mt-0.5">
                      ₹{fmt(c.amount)} total, ₹{fmt(c.amountPaid)} paid — {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                    {c.payments.length > 0 && (
                      <div className="mt-1.5 pl-2 border-l-2 border-admin-gray-100 space-y-0.5">
                        {c.payments.map((p, i) => (
                          <div key={i} className="text-xs text-admin-gray-500">
                            {p.paymentMethod} · ₹{fmt(p.amount)} · {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
