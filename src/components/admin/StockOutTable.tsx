"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageOpen, RefreshCw } from "lucide-react";

export interface StockOutRow {
  id: number;
  name: string;
  sku: string | null;
  price: number;
}

export function StockOutTable({ products }: { products: StockOutRow[] }) {
  const router = useRouter();
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  async function restock(id: number) {
    const qty = Math.max(0, Number(qtyInputs[id]) || 0);
    setBusy(id);
    try {
      await fetch(`/api/ecommerce/products/${id}/restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-admin-gray-200 py-16 text-center text-admin-gray-400">
        <PackageOpen className="w-10 h-10 mx-auto mb-3" />
        <p>No products are currently out of stock. 🎉</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
              <th className="py-3 px-4">Product</th>
              <th className="py-3 px-4">SKU</th>
              <th className="py-3 px-4">Price</th>
              <th className="py-3 px-4">Restock Qty</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-admin-gray-100">
                <td className="py-2.5 px-4 font-medium">{p.name}</td>
                <td className="py-2.5 px-4 text-admin-gray-500">{p.sku ?? "—"}</td>
                <td className="py-2.5 px-4">₹{p.price.toFixed(2)}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      placeholder="Qty"
                      value={qtyInputs[p.id] ?? ""}
                      onChange={(e) => setQtyInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-24 border border-admin-gray-200 rounded px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => restock(p.id)}
                      className="flex items-center gap-1 bg-admin-primary hover:bg-admin-primary-dark text-white text-xs font-medium rounded px-3 py-1.5 disabled:opacity-60"
                    >
                      <RefreshCw className="w-3 h-3" /> Restock
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
