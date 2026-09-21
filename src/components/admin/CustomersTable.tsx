"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, ReceiptText } from "lucide-react";
import { CustomerFormModal, type CustomerFormValues } from "./CustomerFormModal";
import { IconAction, StatusPill, type PillOption } from "./ui/buttons";

const ACTIVE_INACTIVE: readonly PillOption<"active" | "inactive">[] = [
  { value: "active", label: "Active", variant: "success" },
  { value: "inactive", label: "Inactive", variant: "secondary" },
];

export interface CustomerRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  customerType: string;
  status: string;
}

interface CustomersTableProps {
  customers: CustomerRow[];
}

/** Verified against customers.php table + status dropdown + modal-based create/edit. */
export function CustomersTable({ customers }: CustomersTableProps) {
  const router = useRouter();
  const [modalMode, setModalMode] = useState<"closed" | "create" | CustomerFormValues>("closed");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(id: number, status: "active" | "inactive") {
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/customers/${id}`, {
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
      await fetch(`/api/ecommerce/customers/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg">Customer List</h3>
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
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-admin-gray-100">
                  <td className="py-2.5 px-4 font-medium">
                    <Link href={`/admin/ecommerce/customers/${c.id}`} className="text-admin-primary">{c.name}</Link>
                  </td>
                  <td className="py-2.5 px-4">{c.email ?? "—"}</td>
                  <td className="py-2.5 px-4">{c.phone ?? "—"}</td>
                  <td className="py-2.5 px-4 capitalize">{c.customerType}</td>
                  <td className="py-2.5 px-4">
                    <StatusPill label={`Change status of ${c.name}`} value={c.status === "active" ? "active" : "inactive"} options={ACTIVE_INACTIVE} disabled={busy} onChange={(next) => setStatus(c.id, next)} />
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <IconAction tone="view" href={`/admin/ecommerce/billing?customer_id=${c.id}`} title="New Order for this Customer"><ReceiptText /></IconAction>
                      <IconAction tone="edit" title="Edit" onClick={() =>
                          setModalMode({
                            id: c.id,
                            name: c.name,
                            email: c.email ?? "",
                            phone: c.phone ?? "",
                            customerType: c.customerType as "online" | "offline",
                            address: "",
                            status: c.status as "active" | "inactive",
                          })
                        }><Pencil /></IconAction>
                      <IconAction tone="delete" title="Delete" onClick={() => setDeleteTarget({ id: c.id, name: c.name })}><Trash2 /></IconAction>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode !== "closed" && (
        <CustomerFormModal initial={modalMode === "create" ? null : modalMode} onClose={() => setModalMode("closed")} />
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
