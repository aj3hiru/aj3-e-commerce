"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SubcategoryRow {
  id: number;
  name: string;
  slug: string;
  status: string;
  categoryId: number;
  categoryName: string;
}

interface SubcategoriesTableProps {
  subcategories: SubcategoryRow[];
  categories: { id: number; name: string }[];
}

export function SubcategoriesTable({ subcategories, categories }: SubcategoriesTableProps) {
  const router = useRouter();
  const [modal, setModal] = useState<null | { id?: number; name: string; slug: string; categoryId: number }>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function setStatus(id: number, status: "active" | "inactive") {
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/subcategories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitModal(e: React.FormEvent) {
    e.preventDefault();
    if (!modal) return;
    setBusy(true);
    setError("");
    try {
      const url = modal.id ? `/api/ecommerce/subcategories/${modal.id}` : "/api/ecommerce/subcategories";
      const res = await fetch(url, {
        method: modal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modal.name, slug: modal.slug, categoryId: modal.categoryId }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message);
        return;
      }
      router.push(data.redirect);
      router.refresh();
      setModal(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/subcategories/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">Sub Categories</h3>
        <button
          type="button"
          onClick={() => setModal({ name: "", slug: "", categoryId: categories[0]?.id ?? 0 })}
          className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-3.5 py-2"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Slug</th>
                <th className="py-3 px-4">Parent Category</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subcategories.map((s) => (
                <tr key={s.id} className="border-b border-admin-gray-100">
                  <td className="py-2.5 px-4 font-medium">{s.name}</td>
                  <td className="py-2.5 px-4 text-admin-gray-500">{s.slug}</td>
                  <td className="py-2.5 px-4">{s.categoryName}</td>
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setStatus(s.id, s.status === "active" ? "inactive" : "active")}
                      className={cn("text-xs font-semibold rounded px-2.5 py-1.5", s.status === "active" ? "bg-emerald-500 text-white" : "bg-admin-gray-400 text-white")}
                    >
                      {s.status === "active" ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setModal({ id: s.id, name: s.name, slug: s.slug, categoryId: s.categoryId })}
                        className="w-8 h-8 flex items-center justify-center bg-admin-primary-lighter text-admin-primary hover:bg-admin-primary hover:text-white rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
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

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold text-lg mb-4">{modal.id ? "Edit" : "Add"} Sub Category</h5>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{error}</div>}
            <form onSubmit={submitModal} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Parent Category *</label>
                <select
                  value={modal.categoryId}
                  onChange={(e) => setModal({ ...modal, categoryId: Number(e.target.value) })}
                  className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Name *</label>
                <input required value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Slug (leave blank to auto-generate)</label>
                <input value={modal.slug} onChange={(e) => setModal({ ...modal, slug: e.target.value })} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">Cancel</button>
                <button type="submit" disabled={busy} className="px-4 py-2 text-sm rounded bg-admin-primary text-white hover:bg-admin-primary-dark disabled:opacity-60">
                  {busy ? "Saving…" : modal.id ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold mb-2">Confirm Delete?</h5>
            <p className="text-sm text-admin-gray-600 mb-4">
              You are going to delete &quot;<strong>{deleteTarget.name}</strong>&quot;. Do you want to delete it?
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
