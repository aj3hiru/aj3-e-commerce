"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Pencil, Trash2, Plus } from "lucide-react";
import { CategoryFormModal, type CategoryFormValues } from "./CategoryFormModal";
import { cn } from "@/lib/utils";

export interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  metaKeywords: string | null;
  metaDescription: string | null;
  serial: number;
  status: string;
}

interface CategoriesTableProps {
  categories: CategoryRow[];
}

/** Verified against the categories.php table + modal-open buttons + status dropdown. */
export function CategoriesTable({ categories }: CategoriesTableProps) {
  const router = useRouter();
  const [modalMode, setModalMode] = useState<"closed" | "create" | CategoryFormValues>("closed");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(id: number, status: "active" | "inactive") {
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ecommerce/categories/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) {
        alert(data.message);
      }
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">All Categories</h3>
        <button
          type="button"
          onClick={() => setModalMode("create")}
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
                <th className="py-3 px-4">Image</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Slug</th>
                <th className="py-3 px-4">Serial</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-admin-gray-100">
                  <td className="py-2.5 px-4">
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/${c.image}`} alt="" className="w-12 h-12 object-cover rounded" />
                    ) : (
                      <div className="w-12 h-12 bg-admin-gray-100 rounded flex items-center justify-center text-admin-gray-300">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-medium">{c.name}</td>
                  <td className="py-2.5 px-4 text-admin-gray-500">{c.slug}</td>
                  <td className="py-2.5 px-4">{c.serial}</td>
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setStatus(c.id, c.status === "active" ? "inactive" : "active")}
                      className={cn(
                        "text-xs font-semibold rounded px-2.5 py-1.5",
                        c.status === "active" ? "bg-emerald-500 text-white" : "bg-admin-gray-400 text-white"
                      )}
                    >
                      {c.status === "active" ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setModalMode({
                            id: c.id,
                            name: c.name,
                            slug: c.slug,
                            metaKeywords: c.metaKeywords ?? "",
                            metaDescription: c.metaDescription ?? "",
                            serial: c.serial,
                            image: c.image,
                          })
                        }
                        className="w-8 h-8 flex items-center justify-center bg-admin-primary-lighter text-admin-primary hover:bg-admin-primary hover:text-white rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: c.id, name: c.name })}
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
        <CategoryFormModal
          initial={modalMode === "create" ? null : modalMode}
          onClose={() => setModalMode("closed")}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold mb-2">Confirm Delete?</h5>
            <p className="text-sm text-admin-gray-600 mb-4">
              You are going to delete &quot;<strong>{deleteTarget.name}</strong>&quot;. Do you want to delete it?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
