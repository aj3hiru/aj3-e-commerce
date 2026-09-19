"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faShoppingCart, faHourglassHalf, faTruckLoading, faCheckCircle, faBan, faUserFriends, faUserPlus,
  faIndianRupeeSign, faCoins, faClock, faCreditCard, faChartBar, faCube, faThLarge, faTag, faTicketAlt,
  faFileAlt, faChartLine, faChevronRight, faArrowUp, faArrowDown,
} from "@fortawesome/free-solid-svg-icons";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import {
  StatusDropdown, ORDER_STATUSES, PAYMENT_STATUSES, orderStatusVariant, paymentStatusVariant,
} from "../StatusDropdown";
import { SalesChart } from "./SalesChart";
import { formatInt, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Dashboard2Stats } from "@/lib/dashboard2-stats";
import type { Delta } from "@/lib/dashboard2-delta";

/*
 * Colours are EduMint's own statCard() palette from admin/dashboard.php
 * (green #1cc88a, red #e74a5b) plus the admin --primary purple, so this
 * layout still reads as the same product as the rest of the panel.
 */
const TONE = {
  green: { solid: "#1cc88a", tint: "#e8f9f2", ink: "#0f9f6e" },
  purple: { solid: "#7c3aed", tint: "#f5f3ff", ink: "#7c3aed" },
  red: { solid: "#e74a5b", tint: "#fdecee", ink: "#c81e32" },
} as const;
type Tone = keyof typeof TONE;

const CARD = "rounded-[0.75rem] border border-[#e5e7eb] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

/* ─────────────────────────── headline stat card ─────────────────────────── */

function DeltaPill({ delta, goodWhenUp = true }: { delta: Delta; goodWhenUp?: boolean }) {
  // A rise in canceled orders is bad news, so that card reads the colours the
  // other way round. Direction is always also shown as an arrow, never by
  // colour alone.
  const good = delta.direction === "flat" || (delta.direction === "up") === goodWhenUp;
  const text = delta.pct === null ? "New" : `${Math.abs(delta.pct)}%`;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[0.35rem] px-1.5 py-0.5 text-[0.75rem] font-semibold",
          good ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#fef2f2] text-[#b91c1c]"
        )}
      >
        {delta.direction === "up" && <FontAwesomeIcon icon={faArrowUp} className="text-[0.6rem]" />}
        {delta.direction === "down" && <FontAwesomeIcon icon={faArrowDown} className="text-[0.6rem]" />}
        {text}
      </span>
      <span className="whitespace-nowrap text-[0.8125rem] text-[#6b7280]">vs. previous period</span>
    </span>
  );
}

function StatCard2({
  tone, icon, label, value, delta, href, goodWhenUp,
}: {
  tone: Tone; icon: IconDefinition; label: string; value: number; delta: Delta; href: string; goodWhenUp?: boolean;
}) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      className={cn(CARD, "group relative flex gap-4 overflow-hidden p-5 2xl:p-6 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]")}
    >
      {/* the pale disc in the corner */}
      <span aria-hidden className="pointer-events-none absolute -right-[30px] -top-[30px] h-[100px] w-[100px] rounded-full" style={{ background: t.tint }} />
      <span className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[0.75rem] text-[1.35rem] text-white 2xl:h-[60px] 2xl:w-[60px] 2xl:text-[1.5rem]" style={{ background: t.solid }}>
        <FontAwesomeIcon icon={icon} />
      </span>
      <span className="relative min-w-0">
        <span className="block text-[0.9375rem] font-medium text-[#374151]">{label}</span>
        <span className="mt-1 block text-[1.75rem] font-bold leading-tight text-[#111827]">{formatInt(value)}</span>
        <span className="mt-2 block"><DeltaPill delta={delta} goodWhenUp={goodWhenUp} /></span>
      </span>
    </Link>
  );
}

/* ─────────────────────────────── card chrome ─────────────────────────────── */

function CardHeader({ icon, iconClass, title, action }: { icon: IconDefinition; iconClass?: string; title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-3 text-[1.125rem] font-semibold text-[#111827]">
        <span className={cn("text-[1.2rem] text-[#4b5563]", iconClass)}>
          <FontAwesomeIcon icon={icon} />
        </span>
        {title}
      </h2>
      {action}
    </div>
  );
}

/* ─────────────────────────────── page body ─────────────────────────────── */

export function Dashboard2Body({ stats, rangeLabel }: { stats: Dashboard2Stats; rangeLabel: string }) {
  const { isVisible, loaded } = useDashboardWidgetPrefs();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Same PATCH the orders list uses; a rejected change is reported, never
  // left showing a value that was not saved.
  async function patch(id: number, body: Record<string, string>) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/ecommerce/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Could not update the order. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  // Avoid a flash of every card before saved Display Options load.
  if (!loaded) return null;

  const show = (group: string, key: string) => isVisible(group) && isVisible(key);

  const statCards = [
    { key: "d2-on-total", tone: "green", icon: faShoppingCart, label: "Total Orders", value: stats.onTotal, delta: stats.deltas.onTotal, href: "/admin/ecommerce/orders" },
    { key: "d2-on-pending", tone: "purple", icon: faHourglassHalf, label: "Pending Orders", value: stats.onPending, delta: stats.deltas.onPending, href: "/admin/ecommerce/orders?type=Pending" },
    { key: "d2-on-progress", tone: "green", icon: faTruckLoading, label: "In Progress", value: stats.onProgress, delta: stats.deltas.onProgress, href: "/admin/ecommerce/orders?type=In+Progress" },
    { key: "d2-on-delivered", tone: "purple", icon: faCheckCircle, label: "Delivered Orders", value: stats.onDelivered, delta: stats.deltas.onDelivered, href: "/admin/ecommerce/orders?type=Delivered" },
    { key: "d2-on-canceled", tone: "red", icon: faBan, label: "Canceled Orders", value: stats.onCanceled, delta: stats.deltas.onCanceled, href: "/admin/ecommerce/orders?type=Canceled", goodWhenUp: false },
    { key: "d2-cust-online", tone: "purple", icon: faUserFriends, label: "Total Online Customers", value: stats.onCustomers, delta: stats.deltas.onCustomers, href: "/admin/ecommerce/customers" },
    { key: "d2-cust-offline", tone: "green", icon: faUserPlus, label: "Total Offline Customers", value: stats.offCustomers, delta: stats.deltas.offCustomers, href: "/admin/ecommerce/customers" },
  ] as const;
  const visibleStats = statCards.filter((c) => show("d2-orders", c.key));

  const earningTiles = [
    { key: "d2-earning", icon: faCoins, tone: "green", label: `Earnings (${rangeLabel})`, value: stats.periodEarning },
    { key: "d2-due", icon: faClock, tone: "purple", label: `Due (${rangeLabel})`, value: stats.periodNewDue },
    { key: "d2-received", icon: faCreditCard, tone: "green", label: "Payment Received", value: stats.periodDueCollection },
    { key: "d2-pending-pay", icon: faClock, tone: "purple", label: "Pending Payment", value: stats.periodDuePromise },
  ] as const;
  const visibleEarnings = earningTiles.filter((t) => show("d2-earnings", t.key));

  const overviewTiles = [
    { key: "d2-products", icon: faCube, tone: "green", label: "Products", value: stats.totalProducts, href: "/admin/ecommerce/products" },
    { key: "d2-categories", icon: faThLarge, tone: "purple", label: "Categories", value: stats.totalCategories, href: "/admin/ecommerce/categories" },
    { key: "d2-brands", icon: faTag, tone: "purple", label: "Brands", value: stats.totalBrands, href: "/admin/ecommerce/brands" },
    { key: "d2-coupons", icon: faTicketAlt, tone: "green", label: "Active Coupons", value: stats.activeCoupons, href: "/admin/ecommerce/coupons" },
  ] as const;
  const visibleOverview = overviewTiles.filter((t) => show("d2-overview", t.key));

  const showRecent = isVisible("d2-recent");
  const showSales = isVisible("d2-sales");

  const earningsCard = visibleEarnings.length > 0 && (
    <section className={cn(CARD, "p-6")}>
      <CardHeader
        icon={faIndianRupeeSign}
        iconClass="flex h-8 w-8 items-center justify-center rounded-full bg-[#1cc88a] !text-[0.9rem] !text-white"
        title={`Earnings & Due (${rangeLabel})`}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {visibleEarnings.map((t) => (
          <div key={t.key} className="rounded-[0.6rem] border border-[#e5e7eb] px-5 py-4">
            <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-[0.5rem] text-[0.95rem]" style={{ background: TONE[t.tone].tint, color: TONE[t.tone].ink }}>
              <FontAwesomeIcon icon={t.icon} />
            </span>
            <div className="text-[0.8125rem] text-[#6b7280]">{t.label}</div>
            <div className="mt-1 text-[1.5rem] font-bold leading-tight text-[#111827]">{formatMoney(t.value)}</div>
          </div>
        ))}
      </div>
    </section>
  );

  const overviewCard = visibleOverview.length > 0 && (
    <section className={cn(CARD, "p-6")}>
      <CardHeader icon={faChartBar} title="Store Overview" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visibleOverview.map((t) => (
          <Link key={t.key} href={t.href} className="flex flex-col items-start gap-3 rounded-[0.6rem] border border-[#e5e7eb] px-4 py-4 transition-colors hover:bg-[#f9fafb] 2xl:flex-row 2xl:items-center 2xl:gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.6rem] text-[1.25rem]" style={{ background: TONE[t.tone].tint, color: TONE[t.tone].ink }}>
              <FontAwesomeIcon icon={t.icon} />
            </span>
            <span>
              <span className="block text-[0.875rem] text-[#6b7280]">{t.label}</span>
              <span className="block text-[1.5rem] font-bold leading-tight" style={{ color: TONE[t.tone].ink }}>{formatInt(t.value)}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );

  const recentCard = showRecent && (
    <section className={cn(CARD, "p-6")}>
      <CardHeader
        icon={faFileAlt}
        title="Recent Orders"
        action={
          <Link href="/admin/ecommerce/orders" className="flex items-center gap-2 text-[0.875rem] font-medium text-[#7c3aed] hover:underline">
            View All <FontAwesomeIcon icon={faChevronRight} className="text-[0.7rem]" />
          </Link>
        }
      />
      <div className="border-t border-[#f3f4f6] pt-4">
        {error && (
          <div className="mb-3 rounded-[0.5rem] border border-red-200 bg-red-50 px-3 py-2 text-[0.875rem] text-red-700" role="alert">{error}</div>
        )}
        {stats.recentOrders.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="mb-3 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#f3f4f6] text-[1.75rem] text-[#9ca3af]">
              <FontAwesomeIcon icon={faFileAlt} />
            </span>
            <p className="text-[0.9375rem] font-semibold text-[#111827]">No recent orders found</p>
            <p className="mt-1 text-[0.875rem] text-[#6b7280]">Orders will appear here once customers place them</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.875rem]">
              <thead>
                <tr className="text-left text-[0.75rem] uppercase tracking-[0.05em] text-[#9ca3af] [&>th]:pb-3 [&>th]:pr-4 [&>th]:font-semibold">
                  <th>Order #</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((o) => (
                  <tr key={o.id} className="border-t border-[#f3f4f6] [&>td]:py-3 [&>td]:pr-4 [&>td]:align-middle">
                    <td>
                      <Link href={`/admin/ecommerce/orders/${o.id}`} className="whitespace-nowrap font-semibold text-[#7c3aed] hover:underline">{o.orderNumber}</Link>
                    </td>
                    <td className="max-w-[160px] truncate text-[#374151]" title={o.customerName}>{o.customerName}</td>
                    <td className="whitespace-nowrap font-semibold text-[#111827]">{formatMoney(o.totalAmount)}</td>
                    <td>
                      <StatusDropdown
                        label={`Change payment status for order ${o.orderNumber}`}
                        value={o.paymentStatus}
                        options={PAYMENT_STATUSES}
                        variant={paymentStatusVariant(o.paymentStatus)}
                        disabled={busyId === o.id}
                        onSelect={(paymentStatus) => patch(o.id, { paymentStatus })}
                      />
                    </td>
                    <td>
                      <StatusDropdown
                        label={`Change order status for order ${o.orderNumber}`}
                        value={o.orderStatus}
                        options={ORDER_STATUSES}
                        variant={orderStatusVariant(o.orderStatus)}
                        disabled={busyId === o.id}
                        onSelect={(orderStatus) => patch(o.id, { orderStatus })}
                      />
                    </td>
                    <td className="whitespace-nowrap text-[#6b7280]">
                      {o.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );

  const salesCard = showSales && (
    <section className={cn(CARD, "p-6")}>
      <CardHeader icon={faChartLine} title="Sales Overview" />
      <SalesChart series={stats.salesSeries} empty={stats.salesSeriesEmpty} />
    </section>
  );

  /** Two-up row that lets the survivor take the full width when one card is
   *  hidden from Display Options, instead of leaving a hole. */
  function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
    if (!left && !right) return null;
    if (!left || !right) return <div className="mb-6">{left || right}</div>;
    return <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">{left}{right}</div>;
  }

  return (
    <>
      {isVisible("d2-orders") && visibleStats.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {visibleStats.map((c) => (
            <StatCard2
              key={c.key}
              tone={c.tone}
              icon={c.icon}
              label={c.label}
              value={c.value}
              delta={c.delta}
              href={c.href}
              goodWhenUp={"goodWhenUp" in c ? c.goodWhenUp : true}
            />
          ))}
        </div>
      )}

      <Row left={earningsCard} right={overviewCard} />
      <Row left={recentCard} right={salesCard} />
    </>
  );
}
