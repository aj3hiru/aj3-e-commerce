"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Home, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CampaignProductRow {
  id: number;
  name: string;
  price: number;
  campaignPrice: number;
  showOnHome: boolean;
}

interface CampaignOfferManagerProps {
  campaignProducts: CampaignProductRow[];
  availableProducts: { id: number; name: string; price: number }[];
}

export function CampaignOfferManager({ campaignProducts, availableProducts }: CampaignOfferManagerProps) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [campaignPrice, setCampaignPrice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function addToCampaign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ecommerce/campaign-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", productId: Number(productId), campaignPrice: Number(campaignPrice) }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message);
        return;
      }
      router.push(data.redirect);
      router.refresh();
      setProductId("");
      setCampaignPrice("");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromCampaign(id: number) {
    setBusy(true);
    try {
      const res = await fetch("/api/ecommerce/campaign-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", productId: id }),
      });
      const data = await res.json();
      router.push(data.redirect);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleHome(id: number) {
    setBusy(true);
    try {
      await fetch("/api/ecommerce/campaign-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_home", productId: id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-admin-gray-200 p-5 mb-4">
        <h5 className="font-bold mb-3">Add Product to Campaign</h5>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{error}</div>}
        <form onSubmit={addToCampaign} className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium mb-1">Product</label>
            <select required value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="">Select a product</option>
              {availableProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} (₹{p.price.toFixed(2)})</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="block text-xs font-medium mb-1">Campaign Price</label>
            <input type="number" step="0.01" min="0.01" required value={campaignPrice} onChange={(e) => setCampaignPrice(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={busy} className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-4 py-2 disabled:opacity-60">
            <Plus className="w-4 h-4" /> Add
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Regular Price</th>
                <th className="py-3 px-4">Campaign Price</th>
                <th className="py-3 px-4">Show on Home</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaignProducts.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-admin-gray-400 py-8">No products in campaign.</td></tr>
              ) : (
                campaignProducts.map((p) => (
                  <tr key={p.id} className="border-b border-admin-gray-100">
                    <td className="py-2.5 px-4 font-medium">{p.name}</td>
                    <td className="py-2.5 px-4 text-admin-gray-400 line-through">₹{p.price.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-emerald-600 font-bold">₹{p.campaignPrice.toFixed(2)}</td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggleHome(p.id)}
                        className={cn("flex items-center gap-1 text-xs font-semibold rounded px-2.5 py-1.5", p.showOnHome ? "bg-emerald-500 text-white" : "bg-admin-gray-200 text-admin-gray-600")}
                      >
                        <Home className="w-3 h-3" /> {p.showOnHome ? "Shown" : "Hidden"}
                      </button>
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => removeFromCampaign(p.id)}
                        className="flex items-center gap-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white text-xs font-medium rounded px-2.5 py-1.5"
                      >
                        <X className="w-3 h-3" /> Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
