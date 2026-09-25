import Link from "next/link";
import {
  AlertTriangle, BadgePercent, Bell, Bike, Boxes, CalendarClock, CircleX, ClipboardList, Clock, HandCoins, ImageOff, LayoutTemplate,
  Megaphone, PackageCheck, PackagePlus, PackageX, Receipt, ShoppingBag, Star, Store, Truck, UserPlus, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { roleLabel, STAFF_ROLES } from "@/lib/roles";
import type { billingData, catalogData, marketingData, orderDeskData } from "@/lib/role-dashboards";
import { QuickAccept } from "./QuickAccept";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };
const hello = () => { const h = new Date(Date.now() + 5.5 * 3600_000).getUTCHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export function Welcome({ name, role, actions }: { name: string; role: string; actions: { href: string; label: string; icon: typeof Receipt; primary?: boolean }[] }) {
  const color = STAFF_ROLES.find((r) => r.id === role)?.color ?? "#64748b";
  return (
    <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold text-admin-gray-900">{hello()}, {name} 👋</p>
        <span className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 11%, white)` }}>{roleLabel(role)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className={cn("flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold", a.primary ? "bg-admin-primary text-white hover:bg-admin-primary-dark" : "border border-admin-gray-200 text-admin-gray-700 hover:bg-admin-gray-50")}>
            <a.icon className="h-4 w-4" />{a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone, href }: { icon: typeof Receipt; label: string; value: string | number; tone: string; href?: string }) {
  const body = (
    <div className="flex items-center gap-3 rounded-xl border border-admin-gray-200 bg-white p-4 shadow-sm transition hover:border-admin-gray-300">
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg", tone)}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0"><p className="truncate text-xl font-extrabold text-admin-gray-900">{value}</p><p className="truncate text-xs text-admin-gray-500">{label}</p></div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Panel({ title, icon: Icon, children, action }: { title: string; icon: typeof Receipt; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-admin-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-admin-gray-100 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-admin-gray-800"><Icon className="h-4 w-4 text-admin-primary" />{title}</h3>{action}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}
const Empty = ({ text }: { text: string }) => <p className="px-2 py-6 text-center text-sm text-admin-gray-400">{text}</p>;

/* ───────────────────────── Order manager ───────────────────────── */

export function OrderDeskDashboard({ d, canAccept }: { d: Awaited<ReturnType<typeof orderDeskData>>; canAccept: boolean }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={ClipboardList} label="New orders" value={d.stats.pending} tone="bg-amber-50 text-amber-600" href="/admin/ecommerce/orders?type=Pending" />
        <Stat icon={Clock} label="Waiting for agent" value={d.stats.waiting} tone="bg-orange-50 text-orange-600" href="/admin/deliveries?view=all" />
        <Stat icon={Truck} label="Out for delivery" value={d.stats.outFor} tone="bg-sky-50 text-sky-600" href="/admin/deliveries?view=all" />
        <Stat icon={PackageCheck} label="Delivered today" value={d.stats.deliveredToday} tone="bg-emerald-50 text-emerald-600" />
        <Stat icon={CircleX} label="Cancelled today" value={d.stats.canceledToday} tone="bg-red-50 text-red-600" />
        <Stat icon={Wallet} label="COD to collect" value={money(d.stats.codPending)} tone="bg-violet-50 text-violet-600" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="New orders — accept or reject" icon={ClipboardList} action={<Link href="/admin/ecommerce/orders?type=Pending" className="text-xs font-semibold text-admin-primary">All pending →</Link>}>
          {d.newOrders.length === 0 ? <Empty text="No new orders right now." /> : (
            <ul className="divide-y divide-admin-gray-100">
              {d.newOrders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/ecommerce/orders/${o.id}`} className="text-sm font-semibold text-admin-primary hover:underline">#{o.number}</Link>
                    <span className="text-sm text-admin-gray-700"> · {o.customer || "Customer"}</span>
                    <p className="text-xs text-admin-gray-500">{o.items} item{o.items === 1 ? "" : "s"} · {money(o.total)} · {o.paid ? "Paid" : "Unpaid"} · {ago(o.at)}</p>
                  </div>
                  {canAccept && <QuickAccept orderId={o.id} />}
                  <Link href={`/admin/ecommerce/orders/${o.id}`} className="flex h-8 items-center rounded-md border border-admin-gray-200 px-3 text-xs font-semibold text-admin-gray-700 hover:bg-admin-gray-50">Open</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-5">
          <Panel title="Accepted — needs a delivery agent" icon={Bike} action={<Link href="/admin/deliveries?view=all" className="text-xs font-semibold text-admin-primary">Assign →</Link>}>
            {d.readyOrders.length === 0 ? <Empty text="Nothing waiting." /> : (
              <ul className="divide-y divide-admin-gray-100">
                {d.readyOrders.map((o) => <li key={o.id} className="flex justify-between px-2 py-2 text-sm"><Link href={`/admin/ecommerce/orders/${o.id}`} className="font-semibold text-admin-primary">#{o.number}</Link><span className="text-admin-gray-600">{o.customer} · {money(o.total)}</span></li>)}
              </ul>
            )}
          </Panel>
          <Panel title="Recent activity" icon={CalendarClock}>
            {d.recent.length === 0 ? <Empty text="No activity yet." /> : (
              <ul className="space-y-2 px-2 py-1">
                {d.recent.map((e) => (
                  <li key={e.id} className="text-sm">
                    <Link href={`/admin/ecommerce/orders/${e.orderId}`} className="font-semibold text-admin-primary">#{e.number}</Link>{" "}
                    <span className="text-admin-gray-700">{e.type === "assign" ? `assigned to ${e.to ?? "nobody"}` : e.type === "payment" ? `payment ${e.to}` : e.type === "placed" ? "placed" : e.type === "note" ? `note: ${e.note}` : `${e.from} → ${e.to}`}</span>
                    <span className="block text-xs text-admin-gray-400">{e.actor} · {ago(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Cashier ───────────────────────── */

export function BillingDashboard({ d }: { d: Awaited<ReturnType<typeof billingData>> }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={Receipt} label="Counter sales today" value={money(d.stats.salesToday)} tone="bg-emerald-50 text-emerald-600" href="/admin/ecommerce/sales-history" />
        <Stat icon={ShoppingBag} label="Bills today" value={d.stats.salesCount} tone="bg-sky-50 text-sky-600" />
        <Stat icon={HandCoins} label="Due collected today" value={money(d.stats.collectedToday)} tone="bg-violet-50 text-violet-600" href="/admin/ecommerce/due" />
        <Stat icon={AlertTriangle} label={`Outstanding due (${d.stats.dueCount})`} value={money(d.stats.dueOutstanding)} tone="bg-red-50 text-red-600" href="/admin/ecommerce/due" />
      </div>
      <Panel title="Recent counter sales" icon={Receipt} action={<Link href="/admin/ecommerce/sales-history" className="text-xs font-semibold text-admin-primary">Sales history →</Link>}>
        {d.recent.length === 0 ? <Empty text="No sales yet." /> : (
          <ul className="divide-y divide-admin-gray-100">
            {d.recent.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm">
                <span className="min-w-0 truncate"><b className="text-admin-gray-900">#{o.number}</b> · {o.customer}</span>
                <span className="flex shrink-0 items-center gap-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", o.paid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{o.paid ? "Paid" : "Due"}</span><b>{money(o.total)}</b><span className="text-xs text-admin-gray-400">{ago(o.at)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ───────────────────────── Product manager ───────────────────────── */

export function CatalogDashboard({ d }: { d: Awaited<ReturnType<typeof catalogData>> }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Boxes} label="Products" value={d.stats.total} tone="bg-sky-50 text-sky-600" href="/admin/ecommerce/products" />
        <Stat icon={Store} label="Live in the shop" value={d.stats.active} tone="bg-emerald-50 text-emerald-600" />
        <Stat icon={PackageX} label="Out of stock" value={d.stats.out} tone="bg-red-50 text-red-600" href="/admin/ecommerce/stock-out-products" />
        <Stat icon={AlertTriangle} label="Low stock" value={d.stats.low} tone="bg-amber-50 text-amber-600" href="/admin/ecommerce/stock-out-products" />
        <Stat icon={ImageOff} label="Without a photo" value={d.stats.noImage} tone="bg-admin-gray-100 text-admin-gray-600" href="/admin/ecommerce/products" />
        <Stat icon={Star} label="Reviews to approve" value={d.stats.pendingReviews} tone="bg-violet-50 text-violet-600" href="/admin/ecommerce/product-reviews" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Needs restocking" icon={PackageX} action={<Link href="/admin/ecommerce/stock-out-products" className="text-xs font-semibold text-admin-primary">Stock out →</Link>}>
          {d.lowStock.length === 0 ? <Empty text="Everything is in stock." /> : (
            <ul className="divide-y divide-admin-gray-100">
              {d.lowStock.map((p) => <li key={p.id} className="flex justify-between px-2 py-2 text-sm"><span className="truncate">{p.name}</span><b className={(p.stockQty ?? 0) <= 0 ? "text-red-600" : "text-amber-600"}>{(p.stockQty ?? 0) <= 0 ? "Out" : `${p.stockQty} left`}</b></li>)}
            </ul>
          )}
        </Panel>
        <Panel title="Recently added" icon={PackagePlus} action={<Link href="/admin/ecommerce/products/add" className="text-xs font-semibold text-admin-primary">Add product →</Link>}>
          {d.recent.length === 0 ? <Empty text="No products yet." /> : (
            <ul className="divide-y divide-admin-gray-100">
              {d.recent.map((p) => <li key={p.id} className="flex justify-between px-2 py-2 text-sm"><span className="truncate">{p.name}</span><span className={cn("text-xs font-semibold", p.status === "active" ? "text-emerald-600" : "text-admin-gray-400")}>{p.status}</span></li>)}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ───────────────────────── Marketing ───────────────────────── */

export function MarketingDashboard({ d }: { d: Awaited<ReturnType<typeof marketingData>> }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={Megaphone} label="Live campaigns" value={d.stats.campaigns} tone="bg-violet-50 text-violet-600" />
        <Stat icon={BadgePercent} label="Active coupons" value={d.stats.coupons} tone="bg-emerald-50 text-emerald-600" href="/admin/ecommerce/coupons" />
        <Stat icon={Bell} label="Push subscribers" value={d.stats.subscribers} tone="bg-sky-50 text-sky-600" href="/push-notifications/push-manager2" />
        <Stat icon={UserPlus} label="New customers (7 days)" value={d.stats.newCustomers} tone="bg-amber-50 text-amber-600" />
      </div>
      <Panel title="Coupons in use" icon={BadgePercent} action={<Link href="/admin/ecommerce/coupons" className="text-xs font-semibold text-admin-primary">Coupons →</Link>}>
        {d.coupons.length === 0 ? <Empty text="No active coupons." /> : (
          <ul className="divide-y divide-admin-gray-100">
            {d.coupons.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm">
                <span className="min-w-0 truncate"><b className="font-mono">{c.code}</b> · {c.title}</span>
                <span className="shrink-0 text-xs text-admin-gray-500">{c.usedCount}/{c.numberOfTimes} used{c.isPaused && " · paused"}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ href: "/admin/customizer?tab=home", label: "Homepage & offer bar", icon: LayoutTemplate }, { href: "/admin/customizer?tab=product", label: "Product page", icon: ShoppingBag }, { href: "/push-notifications/push-manager2", label: "Send a push notification", icon: Bell }].map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-xl border border-admin-gray-200 bg-white p-4 text-sm font-semibold text-admin-gray-800 shadow-sm hover:border-admin-primary"><l.icon className="h-5 w-5 text-admin-primary" />{l.label}</Link>
        ))}
      </div>
    </div>
  );
}

