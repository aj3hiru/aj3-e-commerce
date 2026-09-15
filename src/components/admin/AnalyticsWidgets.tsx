"use client";

import Link from "next/link";
import { ImageIcon, TrendingUp, TrendingDown, AlertTriangle, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TopProductRow, CategoryBreakdownRow, LowStockRow } from "@/lib/ecommerce-analytics";

export function TopProductsTable({ title, products, icon }: { title: string; products: TopProductRow[]; icon: "up" | "down" }) {
  const Icon = icon === "up" ? TrendingUp : TrendingDown;
  return (
    <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
      <h5 className="flex items-center gap-2 font-bold mb-3">
        <Icon className={cn("w-4 h-4", icon === "up" ? "text-emerald-500" : "text-red-500")} /> {title}
      </h5>
      {products.length === 0 ? (
        <p className="text-sm text-admin-gray-400">No sales data for this period.</p>
      ) : (
        <div className="space-y-2">
          {products.map((p, i) => (
            <Link
              key={p.productId}
              href={`/admin/ecommerce/products/add?edit=${p.productId}`}
              className="flex items-center gap-3 p-2 rounded hover:bg-admin-gray-50"
            >
              <span className="w-5 text-xs text-admin-gray-400 font-mono shrink-0">{i + 1}</span>
              <div className="w-10 h-10 bg-admin-gray-50 rounded flex items-center justify-center overflow-hidden shrink-0">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/${p.image}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-admin-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-admin-gray-400">{p.unitsSold} units · {p.orderCount} orders</div>
              </div>
              <div className="text-sm font-bold shrink-0">₹{p.revenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryBreakdownList({ categories }: { categories: CategoryBreakdownRow[] }) {
  const total = categories.reduce((s, c) => s + c.revenue, 0);
  return (
    <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
      <h5 className="font-bold mb-3">Revenue by Category</h5>
      {categories.length === 0 ? (
        <p className="text-sm text-admin-gray-400">No sales data for this period.</p>
      ) : (
        <div className="space-y-3">
          {categories.map((c) => {
            const pct = total > 0 ? (c.revenue / total) * 100 : 0;
            return (
              <div key={c.categoryId ?? "none"}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{c.categoryName}</span>
                  <span className="text-admin-gray-500">₹{c.revenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="h-2 bg-admin-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-admin-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LowStockAlert({ products }: { products: LowStockRow[] }) {
  if (products.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
      <h5 className="flex items-center gap-2 font-bold mb-3 text-amber-800">
        <AlertTriangle className="w-4 h-4" /> Low Stock Alert
      </h5>
      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.productId} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-amber-500" /> {p.name}</span>
            <span className="font-bold text-amber-700">{p.stockQty ?? 0} left</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrderTypeFilter({ current, range }: { current: string; range: string }) {
  const TYPES = [
    { value: "all", label: "All Sales" },
    { value: "online", label: "Online" },
    { value: "offline", label: "In-Store" },
  ];
  return (
    <div className="flex rounded-md overflow-hidden border border-admin-gray-300 w-fit">
      {TYPES.map((t) => (
        <a
          key={t.value}
          href={`?range=${range}&type=${t.value}`}
          className={cn(
            "px-3 py-1.5 text-[0.8125rem] border-r border-admin-gray-300 last:border-r-0",
            current === t.value ? "bg-admin-primary text-white" : "bg-white text-admin-gray-700 hover:bg-admin-gray-50"
          )}
        >
          {t.label}
        </a>
      ))}
    </div>
  );
}
