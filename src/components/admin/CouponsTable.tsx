"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import { CouponFormModal, type CouponFormValues } from "./CouponFormModal";
import { cn } from "@/lib/utils";

export interface CouponRow {
  id: number;
  title: string;
  code: string;
  numberOfTimes: number;
  usedCount: number;
  discountType: string;
  discountValue: number;
  appliesTo: string;
  productId: number | null;
  categoryId: number | null;
  subcategoryId: number | null;
  status: string;
}

interface CouponsTableProps {
  coupons: CouponRow[];
  products: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  subcategories: { id: number; name: string }[];
}

export function CouponsTable({ coupons, products, categories, subcategories }: CouponsTableProps) {
  const router = useRouter();
  const [modalMode, setModalMode] = useState<"closed" | "create" | CouponFormValues>("closed");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(id: number, status: "active" | "inactive") {
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/coupons/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/coupons/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">Coupons</h3>
        <button type="button" onClick={() => setModalMode("create")} className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-3.5 py-2">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Discount</th>
                <th className="py-3 px-4">Applies To</th>
                <th className="py-3 px-4">Usage</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-b border-admin-gray-100">
                  <td className="py-2.5 px-4 font-medium">{c.title}</td>
                  <td className="py-2.5 px-4"><code className="bg-admin-gray-100 px-1.5 py-0.5 rounded text-xs">{c.code}</code></td>
                  <td className="py-2.5 px-4">{c.discountType === "percentage" ? `${c.discountValue}%` : `₹${c.discountValue}`}</td>
                  <td className="py-2.5 px-4 capitalize">{c.appliesTo}</td>
                  <td className="py-2.5 px-4">{c.usedCount} / {c.numberOfTimes}</td>
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setStatus(c.id, c.status === "active" ? "inactive" : "active")}
                      className={cn("text-xs font-semibold rounded px-2.5 py-1.5", c.status === "active" ? "bg-emerald-500 text-white" : "bg-admin-gray-400 text-white")}
                    >
                      {c.status === "active" ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setModalMode({
                          id: c.id, title: c.title, code: c.code, numberOfTimes: c.numberOfTimes,
                          discountType: c.discountType as "percentage" | "fixed", discountValue: c.discountValue,
                          appliesTo: c.appliesTo as CouponFormValues["appliesTo"],
                          productId: c.productId, categoryId: c.categoryId, subcategoryId: c.subcategoryId,
                        })}
                        className="w-8 h-8 flex items-center justify-center bg-admin-primary-lighter text-admin-primary hover:bg-admin-primary hover:text-white rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: c.id, title: c.title })}
                        className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode !== "closed" && (
        <CouponFormModal
          initial={modalMode === "create" ? null : modalMode}
          onClose={() => setModalMode("closed")}
          products={products}
          categories={categories}
          subcategories={subcategories}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold mb-2">Confirm Delete?</h5>
            <p className="text-sm text-admin-gray-600 mb-4">
              You are going to delete &quot;<strong>{deleteTarget.title}</strong>&quot;. Do you want to delete it?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={busy} className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
