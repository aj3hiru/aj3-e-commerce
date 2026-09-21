"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Pencil, Trash2, Plus, Star } from "lucide-react";
import { BrandFormModal, type BrandFormValues } from "./BrandFormModal";
import { IconAction, StatusPill, type PillOption } from "./ui/buttons";

const ACTIVE_INACTIVE: readonly PillOption<"active" | "inactive">[] = [
  { value: "active", label: "Active", variant: "success" },
  { value: "inactive", label: "Inactive", variant: "secondary" },
];

export interface BrandRow {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  isPopular: boolean;
  status: string;
}

export function BrandsTable({ brands }: { brands: BrandRow[] }) {
  const router = useRouter();
  const [modalMode, setModalMode] = useState<"closed" | "create" | BrandFormValues>("closed");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(id: number, status: "active" | "inactive") {
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/brands/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/brands/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">Brands</h3>
        <button type="button" onClick={() => setModalMode("create")} className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-3.5 py-2">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                <th className="py-3 px-4">Logo</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Popular</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="border-b border-admin-gray-100">
                  <td className="py-2.5 px-4">
                    {b.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/${b.logo}`} alt="" className="w-12 h-12 object-contain rounded" />
                    ) : (
                      <div className="w-12 h-12 bg-admin-gray-100 rounded flex items-center justify-center text-admin-gray-300">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-medium">{b.name}</td>
                  <td className="py-2.5 px-4">{b.isPopular && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}</td>
                  <td className="py-2.5 px-4">
                    <StatusPill label={`Change status of ${b.name}`} value={b.status === "active" ? "active" : "inactive"} options={ACTIVE_INACTIVE} disabled={busy} onChange={(next) => setStatus(b.id, next)} />
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <IconAction tone="edit" title="Edit" onClick={() => setModalMode({ id: b.id, name: b.name, slug: b.slug, isPopular: b.isPopular, logo: b.logo })}><Pencil /></IconAction>
                      <IconAction tone="delete" title="Delete" onClick={() => setDeleteTarget({ id: b.id, name: b.name })}><Trash2 /></IconAction>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode !== "closed" && <BrandFormModal initial={modalMode === "create" ? null : modalMode} onClose={() => setModalMode("closed")} />}

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
