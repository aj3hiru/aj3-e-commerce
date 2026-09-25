"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays, Eye, EyeOff, ExternalLink, HandCoins, IndianRupee, KeyRound, Loader2, Mail, MapPin, MessageCircle, Pencil, Phone,
  Receipt, Save, ShoppingBag, ShoppingCart, Smartphone, TrendingUp, UserRound, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AvatarPicker } from "@/components/staff/AvatarPicker";
import { StatusBadge, StatusPill } from "@/components/admin/ui/buttons";
import { orderStatusVariant, paymentStatusVariant } from "@/components/admin/StatusDropdown";

export interface CustomerProfileData {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  customerType: string;
  status: string;
  avatar?: string | null;
  createdAt?: string;
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
  /** Open the Edit dialog straight away (Customers list → Edit). */
  startEditing?: boolean;
}

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const CARD = "rounded-[10px] border border-admin-gray-200 bg-white shadow-sm";

/** Admin → Customers → one customer: who they are, what they bought, where they live, what they owe. */
export function CustomerProfileView({ customer, orders, credits, totalSpent, totalOrders, addresses = [], login, startEditing }: CustomerProfileViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"orders" | "addresses" | "due">("orders");
  const [editing, setEditing] = useState(!!startEditing);
  const [status, setStatus] = useState(customer.status);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const totalDue = credits.reduce((s, c) => s + Math.max(0, c.amount - c.amountPaid), 0);
  const avg = totalOrders ? totalSpent / totalOrders : 0;
  const last = orders[0]?.createdAt ?? null;
  const phoneDigits = (customer.phone ?? "").replace(/\D/g, "");
  const wa = phoneDigits ? `https://wa.me/${phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits}` : null;

  async function changeStatus(next: string) {
    const before = status;
    setStatus(next);
    const res = await fetch(`/api/ecommerce/customers/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) })
      .then((r) => r.json()).catch(() => null);
    if (!res?.success) { setStatus(before); setToast({ ok: false, text: res?.message || "Couldn't change the status." }); return; }
    setToast({ ok: true, text: next === "active" ? "Customer is active again." : "Customer set to inactive." });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className={cn(CARD, "overflow-hidden")}>
        <div className="h-16 bg-[linear-gradient(120deg,#ede9fe,#fce7f3)]" />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
          <div className="-mt-10 shrink-0">
            <span className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-white bg-violet-100 text-3xl font-bold text-violet-700 shadow-md">
              {customer.avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/${customer.avatar}`} alt="" className="h-full w-full object-cover" />
                : customer.name.trim() ? customer.name.trim().charAt(0).toUpperCase() : <UserRound className="h-10 w-10" />}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold text-admin-gray-900">{customer.name || "No name yet"}</h2>
              <StatusBadge variant={customer.customerType === "offline" ? "warning" : "info"}>{customer.customerType === "offline" ? "Walk-in" : "Online"}</StatusBadge>
              <StatusPill label="Change customer status" value={status === "active" ? "active" : "inactive"}
                options={[{ value: "active", label: "Active", variant: "success" }, { value: "inactive", label: "Inactive", variant: "secondary" }]}
                onChange={changeStatus} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-admin-gray-600">
              {customer.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-admin-gray-400" />{customer.phone}</span>}
              {customer.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-admin-gray-400" />{customer.email}</span>}
              {customer.createdAt && <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-admin-gray-400" />Customer since {day(customer.createdAt)}</span>}
            </div>
            {login && customer.customerType === "online" && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {login.phone && <span className="inline-flex items-center gap-1 rounded-[6px] bg-emerald-50 px-2 py-1 font-semibold text-emerald-700"><Smartphone className="h-3.5 w-3.5" />Mobile OTP login</span>}
                {login.hasPassword && <span className="inline-flex items-center gap-1 rounded-[6px] bg-sky-50 px-2 py-1 font-semibold text-sky-700"><KeyRound className="h-3.5 w-3.5" />Password login</span>}
                {!login.hasPassword && !login.phone && <span className="rounded-[6px] bg-admin-gray-100 px-2 py-1 text-admin-gray-600">No login set up</span>}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className="flex h-10 items-center gap-2 rounded-[8px] bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]"><Pencil className="h-4 w-4" />Edit profile</button>
            <Link href={`/admin/ecommerce/billing?customer_id=${customer.id}`} className="flex h-10 items-center gap-2 rounded-[8px] border border-admin-gray-200 bg-white px-3.5 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50"><ShoppingCart className="h-4 w-4" />New order</Link>
            {customer.phone && <a href={`tel:${customer.phone}`} className="grid h-10 w-10 place-items-center rounded-[8px] border border-admin-gray-200 bg-white text-admin-gray-600 hover:bg-admin-gray-50" title="Call"><Phone className="h-4 w-4" /></a>}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="grid h-10 w-10 place-items-center rounded-[8px] border border-admin-gray-200 bg-white text-emerald-600 hover:bg-emerald-50" title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={ShoppingBag} tone="bg-blue-50 text-blue-600" label="Orders" value={String(totalOrders)} />
        <Stat icon={IndianRupee} tone="bg-emerald-50 text-emerald-600" label="Total spent" value={money(totalSpent)} />
        <Stat icon={TrendingUp} tone="bg-violet-50 text-violet-600" label="Average order" value={money(avg)} />
        <Stat icon={HandCoins} tone={totalDue > 0.004 ? "bg-red-50 text-red-600" : "bg-admin-gray-100 text-admin-gray-500"} label="Due" value={totalDue > 0.004 ? money(totalDue) : "None"} />
        <Stat icon={CalendarDays} tone="bg-amber-50 text-amber-600" label="Last order" value={last ? day(last) : "Never"} />
      </section>

      {/* Tabs */}
      <section className={CARD}>
        <div className="flex gap-1 border-b border-admin-gray-100 px-3 pt-3">
          {([["orders", `Orders (${orders.length})`, Receipt], ["addresses", `Addresses (${addresses.length})`, MapPin], ["due", `Due history (${credits.length})`, HandCoins]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
              className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition", tab === k ? "border-[#2563eb] text-[#2563eb]" : "border-transparent text-admin-gray-500 hover:text-admin-gray-800")}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === "orders" && (orders.length === 0 ? <Empty text="No orders yet." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-admin-gray-200 text-left text-xs uppercase tracking-wide text-admin-gray-500 [&>th]:px-2 [&>th]:py-2.5 [&>th]:font-semibold">
                    <th>Order</th><th>Date</th><th className="text-right">Total</th><th>Payment</th><th>Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-admin-gray-100 last:border-0 [&>td]:px-2 [&>td]:py-2.5">
                      <td><Link href={`/admin/ecommerce/orders/${o.id}`} className="font-semibold text-[#2563eb] hover:underline">{o.orderNumber}</Link></td>
                      <td className="whitespace-nowrap text-admin-gray-600">{day(o.createdAt)}</td>
                      <td className="whitespace-nowrap text-right font-semibold text-admin-gray-900">{money(o.totalAmount)}</td>
                      <td><StatusBadge variant={paymentStatusVariant(o.paymentStatus)}>{o.paymentStatus}</StatusBadge></td>
                      <td><StatusBadge variant={orderStatusVariant(o.orderStatus)}>{o.orderStatus}</StatusBadge></td>
                      <td className="text-right"><Link href={`/admin/ecommerce/orders/${o.id}`} className="inline-grid h-8 w-8 place-items-center rounded-[8px] text-admin-gray-500 hover:bg-admin-gray-100" title="Open order"><Eye className="h-4 w-4" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {tab === "addresses" && (addresses.length === 0 ? <Empty text="No saved addresses yet." /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {addresses.map((a) => (
                <div key={a.id} className={cn("rounded-[10px] border p-3.5 text-sm", a.isDefault ? "border-violet-300 bg-violet-50/40" : "border-admin-gray-200")}>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-admin-gray-800">{a.name}</span>
                    <span className="rounded-[6px] bg-admin-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-admin-gray-600">{a.type}</span>
                    {a.isDefault && <span className="rounded-[6px] bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700">Default</span>}
                  </div>
                  <p className="whitespace-pre-line text-admin-gray-600">{a.text}</p>
                  {a.mapUrl
                    ? <a href={a.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><MapPin className="h-3.5 w-3.5" />Pinned location<ExternalLink className="h-3 w-3" /></a>
                    : <p className="mt-1.5 text-xs text-admin-gray-400">No map location shared</p>}
                </div>
              ))}
            </div>
          ))}

          {tab === "due" && (credits.length === 0 ? <Empty text="No due history." /> : (
            <div className="space-y-2.5">
              {credits.map((c) => {
                const balance = c.amount - c.amountPaid;
                return (
                  <div key={c.id} className="rounded-[10px] border border-admin-gray-200 p-3.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-admin-gray-800">{c.orderNumber ?? "General due"}</span>
                      {balance > 0.004 ? <StatusBadge variant="danger">Due {money(balance)}</StatusBadge> : <StatusBadge variant="success">Fully paid</StatusBadge>}
                    </div>
                    <p className="mt-0.5 text-xs text-admin-gray-500">{money(c.amount)} total · {money(c.amountPaid)} paid · {day(c.createdAt)}</p>
                    {c.payments.length > 0 && (
                      <ul className="mt-2 space-y-0.5 border-l-2 border-admin-gray-100 pl-2.5">
                        {c.payments.map((p, i) => <li key={i} className="text-xs text-admin-gray-600">{day(p.createdAt)} · {p.paymentMethod} · {money(p.amount)}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {customer.address && (
        <section className={cn(CARD, "p-4 text-sm")}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-admin-gray-500">Address on file</p>
          <p className="whitespace-pre-line text-admin-gray-700">{customer.address}</p>
        </section>
      )}

      {editing && <EditCustomer customer={customer} onClose={() => setEditing(false)} onSaved={(text) => { setEditing(false); setToast({ ok: true, text }); router.refresh(); }} />}
      {toast && (
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] rounded-[8px] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>{toast.text}</div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value }: { icon: typeof ShoppingBag; tone: string; label: string; value: string }) {
  return (
    <div className={cn(CARD, "flex items-center gap-3 p-4")}>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[8px]", tone)}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold text-admin-gray-900">{value}</p>
        <p className="text-xs text-admin-gray-500">{label}</p>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-admin-gray-400">{text}</p>;
}

/** Everything about the customer in one place: photo, name, mobile, email, address, type, status and a new password. */
function EditCustomer({ customer, onClose, onSaved }: { customer: CustomerProfileData; onClose: () => void; onSaved: (text: string) => void }) {
  const [f, setF] = useState({
    name: customer.name, phone: customer.phone ?? "", email: customer.email ?? "", address: customer.address ?? "",
    customerType: customer.customerType, status: customer.status, avatar: customer.avatar ?? "", newPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setErr(""); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.newPassword && f.newPassword.length < 6) { setErr("The new password needs at least 6 characters."); return; }
    setBusy(true);
    const res = await fetch(`/api/ecommerce/customers/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!res?.success) { setErr(res?.message || "Couldn't save. Please try again."); return; }
    onSaved(f.newPassword ? "Profile saved and password changed." : "Profile saved.");
  }

  const input = "h-10 w-full rounded-[8px] border border-admin-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/10";
  const label = "mb-1 block text-[13px] font-semibold text-admin-gray-700";
  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={save} className="my-4 w-full max-w-[640px] rounded-[10px] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Edit customer">
        <div className="flex items-center justify-between border-b border-admin-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-admin-gray-900">Edit customer</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-[8px] text-admin-gray-500 hover:bg-admin-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-[120px_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-1">
            <AvatarPicker value={f.avatar} onChange={(p) => set("avatar", p)} name={f.name} size={96} uploadUrl="/api/ecommerce/customers/avatar" />
            <span className="text-xs text-admin-gray-500">Profile photo</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={label} htmlFor="ec-name">Full name *</label><input id="ec-name" required value={f.name} onChange={(e) => set("name", e.target.value)} className={input} /></div>
            <div><label className={label} htmlFor="ec-phone">Mobile number</label><input id="ec-phone" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={input} /></div>
            <div><label className={label} htmlFor="ec-email">Email</label><input id="ec-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="Optional" className={input} /></div>
            <div className="sm:col-span-2"><label className={label} htmlFor="ec-addr">Address</label><textarea id="ec-addr" rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} className={cn(input, "h-auto py-2")} /></div>
            <div>
              <label className={label} htmlFor="ec-type">Customer type</label>
              <select id="ec-type" value={f.customerType} onChange={(e) => set("customerType", e.target.value)} className={input}>
                <option value="online">Online</option><option value="offline">Walk-in (store)</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="ec-status">Status</label>
              <select id="ec-status" value={f.status} onChange={(e) => set("status", e.target.value)} className={input}>
                <option value="active">Active</option><option value="inactive">Inactive (can&apos;t log in)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="ec-pw">Set a new password</label>
              <div className="relative">
                <input id="ec-pw" type={showPw ? "text" : "password"} value={f.newPassword} onChange={(e) => set("newPassword", e.target.value)} autoComplete="new-password" placeholder="Leave blank to keep the current one" className={cn(input, "pr-10")} />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-admin-gray-500">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              <p className="mt-1 text-xs text-admin-gray-500">The customer can then log in with their mobile / email and this password.</p>
            </div>
          </div>
        </div>
        {err && <p role="alert" className="mx-5 mb-3 rounded-[8px] bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="flex justify-end gap-2 border-t border-admin-gray-100 px-5 py-3">
          <button type="button" onClick={onClose} className="h-10 rounded-[8px] border border-admin-gray-200 px-4 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50">Cancel</button>
          <button type="submit" disabled={busy} className="flex h-10 items-center gap-2 rounded-[8px] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
