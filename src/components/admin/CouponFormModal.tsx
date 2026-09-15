"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CouponFormValues {
  id?: number;
  title: string;
  code: string;
  numberOfTimes: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  appliesTo: "all" | "product" | "category" | "subcategory";
  productId: number | null;
  categoryId: number | null;
  subcategoryId: number | null;
}

interface CouponFormModalProps {
  initial: CouponFormValues | null;
  onClose: () => void;
  products: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  subcategories: { id: number; name: string }[];
}

export function CouponFormModal({ initial, onClose, products, categories, subcategories }: CouponFormModalProps) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<CouponFormValues>(
    initial ?? { title: "", code: "", numberOfTimes: 1, discountType: "percentage", discountValue: 0, appliesTo: "all", productId: null, categoryId: null, subcategoryId: null }
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const url = isEdit ? `/api/ecommerce/coupons/${initial!.id}` : "/api/ecommerce/coupons";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Save failed.");
        return;
      }
      router.push(data.redirect);
      router.refresh();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h5 className="font-bold text-lg mb-4">{isEdit ? "Edit Coupon" : "Add Coupon"}</h5>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Title *</label>
            <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Code *</label>
            <input required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm uppercase" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Discount Type</label>
              <select value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as "percentage" | "fixed" }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Discount Value *</label>
              <input type="number" step="0.01" min={0.01} required value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Usage Limit</label>
            <input type="number" min={1} value={form.numberOfTimes} onChange={(e) => setForm((f) => ({ ...f, numberOfTimes: Math.max(1, Number(e.target.value)) }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Applies To</label>
            <select
              value={form.appliesTo}
              onChange={(e) => setForm((f) => ({ ...f, appliesTo: e.target.value as CouponFormValues["appliesTo"], productId: null, categoryId: null, subcategoryId: null }))}
              className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
            >
              <option value="all">All Products</option>
              <option value="product">Specific Product</option>
              <option value="category">Specific Category</option>
              <option value="subcategory">Specific Sub Category</option>
            </select>
          </div>

          {form.appliesTo === "product" && (
            <div>
              <label className="block text-xs font-medium mb-1">Product *</label>
              <select required value={form.productId ?? ""} onChange={(e) => setForm((f) => ({ ...f, productId: Number(e.target.value) }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                <option value="">Select a product</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {form.appliesTo === "category" && (
            <div>
              <label className="block text-xs font-medium mb-1">Category *</label>
              <select required value={form.categoryId ?? ""} onChange={(e) => setForm((f) => ({ ...f, categoryId: Number(e.target.value) }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                <option value="">Select a category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {form.appliesTo === "subcategory" && (
            <div>
              <label className="block text-xs font-medium mb-1">Sub Category *</label>
              <select required value={form.subcategoryId ?? ""} onChange={(e) => setForm((f) => ({ ...f, subcategoryId: Number(e.target.value) }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                <option value="">Select a sub category</option>
                {subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded bg-admin-primary text-white hover:bg-admin-primary-dark disabled:opacity-60">
              {submitting ? "Saving…" : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
