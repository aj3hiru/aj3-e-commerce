"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GstRateRow {
  id: number;
  label: string;
  rate: number;
  isDefault: boolean;
}

export function TaxSettingsManager({ rates }: { rates: GstRateRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<null | { id?: number; label: string; rate: string }>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function setDefault(id: number) {
    setBusy(true);
    try {
      const res = await fetch("/api/ecommerce/gst-rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setDefaultId: id }),
      });
      const data = await res.json();
      router.push(data.redirect);
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
      const res = await fetch("/api/ecommerce/gst-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editId: modal.id, label: modal.label, rate: Number(modal.rate) }),
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
      const res = await fetch(`/api/ecommerce/gst-rates?id=${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      router.push(data.redirect);
      router.refresh();
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">GST Slabs</h3>
        <button
          type="button"
          onClick={() => setModal({ label: "", rate: "" })}
          className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-3.5 py-2"
        >
          <Plus className="w-4 h-4" /> Add Slab
        </button>
      </div>

      <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                <th className="py-3 px-4">Label</th>
                <th className="py-3 px-4">Rate</th>
                <th className="py-3 px-4">Default</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-b border-admin-gray-100">
                  <td className="py-2.5 px-4 font-medium">{r.label}</td>
                  <td className="py-2.5 px-4">{r.rate}%</td>
                  <td className="py-2.5 px-4">
                    {r.isDefault ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-600"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Default</span>
                    ) : (
                      <button disabled={busy} onClick={() => setDefault(r.id)} className="text-xs text-admin-primary font-medium">Set as default</button>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setModal({ id: r.id, label: r.label, rate: String(r.rate) })}
                        className="w-8 h-8 flex items-center justify-center bg-admin-primary-lighter text-admin-primary hover:bg-admin-primary hover:text-white rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: r.id, label: r.label })}
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
            <h5 className="font-bold text-lg mb-4">{modal.id ? "Edit" : "Add"} GST Slab</h5>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{error}</div>}
            <form onSubmit={submitModal} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Label *</label>
                <input required value={modal.label} onChange={(e) => setModal({ ...modal, label: e.target.value })} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" placeholder="e.g. GST 18%" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Rate (%) *</label>
                <input type="number" step="0.01" required value={modal.rate} onChange={(e) => setModal({ ...modal, rate: e.target.value })} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
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
            <p className="text-sm text-admin-gray-600 mb-4">Delete GST slab &quot;<strong>{deleteTarget.label}</strong>&quot;?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">Cancel</button>
              <button onClick={confirmDelete} disabled={busy} className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
