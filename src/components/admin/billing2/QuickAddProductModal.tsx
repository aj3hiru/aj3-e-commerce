"use client";

import { useState } from "react";
import { X, PackagePlus } from "lucide-react";
import type { PosProduct } from "@/types/pos";

const UNIT_PRESETS = ["KG", "Gram", "Liter", "ml", "cm", "Meter", "Piece"];

interface QuickAddProductModalProps {
  onClose: () => void;
  /** Called after the product is created on the server, with the quantity
   *  the cashier wants to add straight away. */
  onAdded: (product: PosProduct, qty: number) => void;
}

/**
 * "This customer bought something that isn't in the catalog yet" — a small
 * form that creates a real product (via /api/ecommerce/billing/quick-product)
 * and drops it straight into the cart, instead of the sale being blocked or
 * a made-up line item that no report or stock count would ever know about.
 */
export function QuickAddProductModal({ onClose, onAdded }: QuickAddProductModalProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [gstRate, setGstRate] = useState("0");
  const [qty, setQty] = useState("1");
  const [unitChoice, setUnitChoice] = useState("");
  const [unitCustom, setUnitCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const priceNum = Number(price);
    const qtyNum = Math.max(1, Math.floor(Number(qty)) || 1);
    if (!name.trim()) return setError("Product name is required.");
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("Enter a valid price.");

    setSaving(true);
    try {
      const res = await fetch("/api/ecommerce/billing/quick-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          price: priceNum,
          gst_rate: Number(gstRate) || 0,
          unit: unitChoice === "custom" ? unitCustom.trim() : unitChoice,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Could not add this product.");
        return;
      }
      onAdded(data.product, qtyNum);
      onClose();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add a product not in the list"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-admin-gray-900">
            <PackagePlus className="h-4 w-4 text-admin-primary" /> Add a New Product
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-admin-gray-400 hover:bg-admin-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-admin-gray-600">Product name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full rounded border border-admin-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. Rice 1KG Pack"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-admin-gray-600">Price *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded border border-admin-gray-300 px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-admin-gray-600">Quantity</label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded border border-admin-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-admin-gray-600">Unit</label>
              <select
                value={unitChoice}
                onChange={(e) => setUnitChoice(e.target.value)}
                className="w-full rounded border border-admin-gray-300 px-3 py-2 text-sm"
              >
                <option value="">No unit</option>
                {UNIT_PRESETS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-admin-gray-600">GST rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                className="w-full rounded border border-admin-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {unitChoice === "custom" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-admin-gray-600">Custom unit name</label>
              <input
                type="text"
                value={unitCustom}
                onChange={(e) => setUnitCustom(e.target.value)}
                className="w-full rounded border border-admin-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Dozen, Box"
              />
            </div>
          )}

          <p className="text-xs text-admin-gray-400">
            This saves it as a real product too, so it's ready to sell again next time.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded border border-admin-gray-300 py-2 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded bg-admin-primary py-2 text-sm font-semibold text-white hover:bg-admin-primary-dark disabled:opacity-60"
            >
              {saving ? "Adding…" : "Add to Cart"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
