"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, ExternalLink } from "lucide-react";
import { IconAction, StatusBadge } from "./ui/buttons";

export interface PageRow {
  id: number;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
}

export function PagesTable({ pages }: { pages: PageRow[] }) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pages/${deleteTarget.id}`, { method: "DELETE" });
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
        <h3 className="font-bold text-lg">Pages</h3>
        <Link href="/admin/pages/new" className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-3.5 py-2">
          <Plus className="w-4 h-4" /> Add Page
        </Link>
      </div>

      {pages.length === 0 ? (
        <div className="bg-white rounded-lg border border-admin-gray-200 py-16 text-center text-admin-gray-400">
          <p>No pages yet — create your first one (About Us, Terms, Privacy Policy…).</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Slug</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Updated</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id} className="border-b border-admin-gray-100">
                    <td className="py-2.5 px-4 font-medium">{p.title}</td>
                    <td className="py-2.5 px-4 text-admin-gray-500">/{p.slug}</td>
                    <td className="py-2.5 px-4">
                      <StatusBadge variant={p.status === "published" ? "success" : "secondary"}>{p.status === "published" ? "Published" : "Draft"}</StatusBadge>
                    </td>
                    <td className="py-2.5 px-4">{new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5">
                        {p.status === "published" && (
                          <IconAction tone="view" href={`/${p.slug}`} target="_blank" rel="noreferrer" title="View page"><ExternalLink /></IconAction>
                        )}
                        <IconAction tone="edit" href={`/admin/pages/${p.id}`} title="Edit"><Pencil /></IconAction>
                        <IconAction tone="delete" title="Delete" onClick={() => setDeleteTarget({ id: p.id, title: p.title })}><Trash2 /></IconAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold mb-2">Confirm Delete?</h5>
            <p className="text-sm text-admin-gray-600 mb-4">Delete &quot;<strong>{deleteTarget.title}</strong>&quot;?</p>
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
