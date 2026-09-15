"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageIcon, Barcode, Pencil, Trash2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProductRow {
  id: number;
  name: string;
  image: string | null;
  price: number;
  salePrice: number | null;
  status: string;
  productType: string;
  itemType: string;
  stockQty: number | null;
  badgeTag: string;
}

interface ProductsTableProps {
  products: ProductRow[];
  badgeLabels: Record<string, string>;
  badgeColors: Record<string, string | null>;
}

/** Verified against the #admin-table markup + openDeleteModal()/status dropdown JS
 *  in products.php. DataTables' client-side sort/search/paging is replaced here with
 *  plain client-side state — same end-user capability, no jQuery dependency. */
export function ProductsTable({ products, badgeLabels, badgeColors }: ProductsTableProps) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [openStatusId, setOpenStatusId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(id: number, status: "active" | "inactive") {
    setOpenStatusId(null);
    setBusy(true);
    try {
      await fetch(`/api/ecommerce/products/${id}`, {
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
      await fetch(`/api/ecommerce/products/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                <th className="py-3 px-4">Image</th>
                <th className="py-3 px-4 w-1/4">Name</th>
                <th className="py-3 px-4">Price</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Item Type</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const hasSale = !!p.salePrice && p.salePrice > 0 && p.salePrice < p.price;
                const bcolor = badgeColors[p.badgeTag];
                return (
                  <tr key={p.id} className="border-b border-admin-gray-100">
                    <td className="py-2.5 px-4">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/${p.image}`} alt="" className="w-12 h-12 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-12 bg-admin-gray-100 rounded flex items-center justify-center text-admin-gray-300">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {p.name}
                      {p.stockQty !== null && p.stockQty <= 0 && p.productType === "physical" && (
                        <span className="ml-1.5 inline-block bg-red-500 text-white text-[0.7rem] rounded px-1.5 py-0.5">Out of stock</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      ₹{(hasSale ? p.salePrice! : p.price).toFixed(2)}
                      {hasSale && <div className="text-xs text-admin-gray-400 line-through">₹{p.price.toFixed(2)}</div>}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          onClick={() => setOpenStatusId(openStatusId === p.id ? null : p.id)}
                          className={cn(
                            "flex items-center gap-1 text-xs font-semibold rounded px-2.5 py-1.5",
                            p.status === "active" ? "bg-emerald-500 text-white" : "bg-admin-gray-400 text-white"
                          )}
                        >
                          {p.status === "active" ? "Publish" : "Unpublish"} <ChevronDown className="w-3 h-3" />
                        </button>
                        {openStatusId === p.id && (
                          <div className="absolute z-10 mt-1 bg-white border border-admin-gray-200 rounded shadow-lg min-w-[120px]">
                            <button className="block w-full text-left px-3 py-1.5 text-xs hover:bg-admin-gray-50" onClick={() => setStatus(p.id, "active")}>Publish</button>
                            <button className="block w-full text-left px-3 py-1.5 text-xs hover:bg-admin-gray-50" onClick={() => setStatus(p.id, "inactive")}>Unpublish</button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      {p.badgeTag === "none" || !bcolor ? (
                        <span className="text-admin-gray-400 text-xs">{badgeLabels[p.badgeTag] ?? "None"}</span>
                      ) : (
                        <span
                          className="text-white text-xs font-bold rounded-full px-2.5 py-0.5"
                          style={{ background: bcolor }}
                        >
                          {badgeLabels[p.badgeTag] ?? p.badgeTag}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 capitalize">{p.itemType}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`/admin/ecommerce/barcode-print?ids=${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Print Barcode"
                          className="w-8 h-8 flex items-center justify-center bg-admin-gray-100 hover:bg-admin-gray-200 rounded"
                        >
                          <Barcode className="w-3.5 h-3.5" />
                        </a>
                        <Link
                          href={`/admin/ecommerce/products/add?edit=${p.id}`}
                          className="w-8 h-8 flex items-center justify-center bg-admin-primary-lighter text-admin-primary hover:bg-admin-primary hover:text-white rounded"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                          className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold mb-2">Confirm Delete?</h5>
            <p className="text-sm text-admin-gray-600 mb-4">
              You are going to delete &quot;<strong>{deleteTarget.name}</strong>&quot;. Do you want to delete it?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200"
              >
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
