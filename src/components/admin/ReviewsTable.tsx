"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconAction, StatusPill, type PillOption } from "./ui/buttons";

const REVIEW_OPTIONS: readonly PillOption<string>[] = [
  { value: "pending", label: "Pending", variant: "warning" },
  { value: "approved", label: "Approved", variant: "success" },
  { value: "rejected", label: "Rejected", variant: "danger" },
];

export interface ReviewRow {
  id: number;
  productName: string;
  rating: number;
  reviewText: string | null;
  customerName: string;
  status: string;
  createdAt: string;
}

export function ReviewsTable({ reviews }: { reviews: ReviewRow[] }) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(id: number, status: string) {
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/product-reviews/${id}`, {
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
      await fetch(`/api/ecommerce/product-reviews/${deleteTarget}`, { method: "DELETE" });
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (reviews.length === 0) {
    return <div className="bg-white rounded-lg border border-admin-gray-200 py-16 text-center text-admin-gray-400">No reviews yet.</div>;
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Rating</th>
                <th className="py-3 px-4">Comment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-b border-admin-gray-100">
                  <td className="py-2.5 px-4 font-medium">{r.productName}</td>
                  <td className="py-2.5 px-4">{r.customerName}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn("w-3.5 h-3.5", i < r.rating ? "fill-amber-400 text-amber-400" : "text-admin-gray-200")} />
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 max-w-[280px] truncate" title={r.reviewText ?? ""}>{r.reviewText ?? "—"}</td>
                  <td className="py-2.5 px-4">
                    <StatusPill label={`Change status of review by ${r.customerName}`} value={r.status} options={REVIEW_OPTIONS} disabled={busy} onChange={(next) => setStatus(r.id, next)} />
                  </td>
                  <td className="py-2.5 px-4">{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="py-2.5 px-4">
                    <IconAction tone="delete" title="Delete" onClick={() => setDeleteTarget(r.id)}><Trash2 /></IconAction>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold mb-2">Confirm Delete?</h5>
            <p className="text-sm text-admin-gray-600 mb-4">Delete this review?</p>
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
