"use client";

import {
  ShoppingCart, Hourglass, Truck, CheckCircle, Ban, UserPlus,
  IndianRupee, PlusCircle, CircleDollarSign, CalendarCheck, Wallet, Smartphone, CreditCard,
  Boxes, PackageOpen, List, Copyright, Users, StarHalf, Star, Percent,
  Globe, HandCoins,
} from "lucide-react";
import { StatCard } from "./StatCard";
import { RecentOrdersTable } from "./RecentOrdersTable";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/dashboard-stats";

interface DashboardSectionsProps {
  stats: DashboardStats;
  rangeLabel: string;
}

const fmt = (n: number) => n.toLocaleString("en-IN");
const fmtMoney = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Verified against the three data-widget="..." sections + recentorders card in
 *  dashboard.php, including which stat cards live under which section. */
export function DashboardSections({ stats, rangeLabel }: DashboardSectionsProps) {
  const { isVisible, loaded } = useDashboardWidgetPrefs();

  // Avoid a flash of all-cards-visible before localStorage prefs load client-side.
  if (!loaded) return null;

  return (
    <>
      <div className={cn(!isVisible("online") && "hidden")}>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-admin-gray-400 mt-6 mb-3">
          <Globe className="w-3.5 h-3.5" /> Online Platform
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isVisible("card-on-total") && <StatCard color="green" icon={ShoppingCart} label="Total Orders" value={fmt(stats.onTotal)} widgetKey="card-on-total" href="/admin/ecommerce/orders" />}
          {isVisible("card-on-pending") && <StatCard color="green" icon={Hourglass} label="Pending Orders" value={fmt(stats.onPending)} widgetKey="card-on-pending" href="/admin/ecommerce/orders?type=Pending" />}
          {isVisible("card-on-progress") && <StatCard color="green" icon={Truck} label="In Progress" value={fmt(stats.onProgress)} widgetKey="card-on-progress" href="/admin/ecommerce/orders?type=In+Progress" />}
          {isVisible("card-on-delivered") && <StatCard color="green" icon={CheckCircle} label="Delivered Orders" value={fmt(stats.onDelivered)} widgetKey="card-on-delivered" href="/admin/ecommerce/orders?type=Delivered" />}
          {isVisible("card-on-canceled") && <StatCard color="red" icon={Ban} label="Canceled Orders" value={fmt(stats.onCanceled)} widgetKey="card-on-canceled" href="/admin/ecommerce/orders?type=Canceled" />}
          {isVisible("card-on-custonline") && <StatCard color="cyan" icon={UserPlus} label="Total Online Customers" value={fmt(stats.onCustomers)} widgetKey="card-on-custonline" href="/admin/ecommerce/customers" />}
          {isVisible("card-on-custoffline") && <StatCard color="orange" icon={UserPlus} label="Total Offline Customers" value={fmt(stats.offCustomers)} widgetKey="card-on-custoffline" href="/admin/ecommerce/customers" />}
        </div>
      </div>

      <div className={cn(!isVisible("earnings") && "hidden")}>
        <div className="text-xs font-bold uppercase tracking-wide text-admin-gray-400 mt-6 mb-3">
          Earnings &amp; Due ({rangeLabel})
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isVisible("card-earning") && <StatCard color="red" icon={IndianRupee} label={`Earning (${rangeLabel})`} value={fmtMoney(stats.periodEarning)} widgetKey="card-earning" href="/admin/ecommerce/sales-history" />}
          {isVisible("card-newdue") && <StatCard color="orange" icon={PlusCircle} label="New Due" value={fmtMoney(stats.periodNewDue)} widgetKey="card-newdue" href="/admin/ecommerce/due" />}
          {isVisible("card-duecollection") && <StatCard color="cyan" icon={CircleDollarSign} label="Due Collection" value={fmtMoney(stats.periodDueCollection)} widgetKey="card-duecollection" href="/admin/ecommerce/due" />}
          {isVisible("card-duepromise") && <StatCard color="orange" icon={CalendarCheck} label="Due Promise" value={fmtMoney(stats.periodDuePromise)} widgetKey="card-duepromise" href="/admin/ecommerce/due" />}
        </div>

        <div className="text-xs font-bold uppercase tracking-wide text-admin-gray-400 mt-6 mb-3">
          Payment Method ({rangeLabel})
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isVisible("card-cash") && <StatCard color="green" icon={Wallet} label="Cash" value={fmtMoney(stats.pmCash)} widgetKey="card-cash" href="/admin/ecommerce/sales-history" />}
          {isVisible("card-upi") && <StatCard color="blue" icon={Smartphone} label="UPI" value={fmtMoney(stats.pmUpi)} widgetKey="card-upi" href="/admin/ecommerce/sales-history" />}
          {isVisible("card-card") && <StatCard color="cyan" icon={CreditCard} label="Card" value={fmtMoney(stats.pmCard)} widgetKey="card-card" href="/admin/ecommerce/sales-history" />}
        </div>
      </div>

      <div className={cn(!isVisible("overview") && "hidden")}>
        <div className="text-xs font-bold uppercase tracking-wide text-admin-gray-400 mt-6 mb-3">Store Overview</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isVisible("card-products") && <StatCard color="blue" icon={Boxes} label="Total Products" value={fmt(stats.totalProducts)} widgetKey="card-products" href="/admin/ecommerce/products" />}
          {isVisible("card-outofstock") && <StatCard color="red" icon={PackageOpen} label="Out of Stock" value={fmt(stats.outOfStock)} widgetKey="card-outofstock" href="/admin/ecommerce/stock-out-products" />}
          {isVisible("card-categories") && <StatCard color="blue" icon={List} label="Total Categories" value={fmt(stats.totalCategories)} widgetKey="card-categories" href="/admin/ecommerce/categories" />}
          {isVisible("card-brands") && <StatCard color="blue" icon={Copyright} label="Total Brands" value={fmt(stats.totalBrands)} widgetKey="card-brands" href="/admin/ecommerce/brands" />}
          {isVisible("card-customers") && <StatCard color="cyan" icon={Users} label="Customers" value={fmt(stats.periodCustomers)} widgetKey="card-customers" href="/admin/ecommerce/customers" />}
          {isVisible("card-newcustomers") && <StatCard color="cyan" icon={UserPlus} label="New Customers" value={fmt(stats.periodNewCustomers)} widgetKey="card-newcustomers" href="/admin/ecommerce/customers" />}
          {isVisible("card-reviewstoday") && <StatCard color="cyan" icon={StarHalf} label={`Reviews (${rangeLabel})`} value={fmt(stats.periodReviewsToday)} widgetKey="card-reviewstoday" href="/admin/ecommerce/product-reviews" />}
          {isVisible("card-reviewstotal") && <StatCard color="cyan" icon={Star} label="Total Reviews" value={fmt(stats.periodReviewsTotal)} widgetKey="card-reviewstotal" href="/admin/ecommerce/product-reviews" />}
          {isVisible("card-coupons") && <StatCard color="orange" icon={Percent} label="Active Coupons" value={fmt(stats.activeCoupons)} widgetKey="card-coupons" href="/admin/ecommerce/coupons" />}
        </div>
      </div>

      <div className={cn(!isVisible("recentorders") && "hidden")}>
        <RecentOrdersTable orders={stats.recentOrders} rangeLabel={rangeLabel} />
      </div>
    </>
  );
}
