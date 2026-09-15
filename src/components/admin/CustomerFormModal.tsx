"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CustomerFormValues {
  id?: number;
  name: string;
  email: string;
  phone: string;
  customerType: "online" | "offline";
  address: string;
  status: "active" | "inactive";
}

interface CustomerFormModalProps {
  initial: CustomerFormValues | null;
  onClose: () => void;
}

export function CustomerFormModal({ initial, onClose }: CustomerFormModalProps) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<CustomerFormValues>(
    initial ?? { name: "", email: "", phone: "", customerType: "offline", address: "", status: "active" }
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const url = isEdit ? `/api/ecommerce/customers/${initial!.id}` : "/api/ecommerce/customers";
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
      router.push(data.redirect || "/admin/ecommerce/customers");
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
        <h5 className="font-bold text-lg mb-4">{isEdit ? "Edit Customer" : "Add Customer"}</h5>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Name *</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email *</label>
            <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Phone</label>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Customer Type</label>
            <select value={form.customerType} onChange={(e) => setForm((f) => ({ ...f, customerType: e.target.value as "online" | "offline" }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="offline">Offline (Walk-in)</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Address</label>
            <textarea rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
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
