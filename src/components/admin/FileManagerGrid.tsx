"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, Trash2, Search, FileText, Film, Music, Archive, File as FileIcon, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: number;
  filePath: string;
  fileType: string;
  altText: string | null;
  title: string | null;
  caption: string | null;
  description: string | null;
  uploadedAt: string;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pdf: FileText, video: Film, audio: Music, archive: Archive, document: FileText, other: FileIcon,
};

export function FileManagerGrid() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: typeFilter, search, page: String(page) });
      const res = await fetch(`/api/media?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search, page]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        await fetch("/api/media", { method: "POST", body: form });
      }
      setPage(1);
      await load();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} file(s)? This cannot be undone.`)) return;
    await fetch("/api/media/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    setSelected(new Set());
    await load();
  }

  async function deleteOne(id: number) {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    await fetch(`/api/media/${id}`, { method: "DELETE" });
    await load();
  }

  async function saveMeta(item: MediaItem) {
    await fetch(`/api/media/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ altText: item.altText, title: item.title, caption: item.caption, description: item.description }),
    });
    setEditing(null);
    await load();
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-admin-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search files…"
              className="pl-8 pr-3 py-2 text-sm border border-admin-gray-200 rounded"
            />
          </div>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="border border-admin-gray-200 rounded px-3 py-2 text-sm">
            <option value="all">All Types</option>
            <option value="image">Images</option>
            <option value="pdf">PDFs</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="document">Documents</option>
            <option value="archive">Archives</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={bulkDelete} className="flex items-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white text-sm font-medium rounded px-3.5 py-2">
              <Trash2 className="w-4 h-4" /> Delete ({selected.size})
            </button>
          )}
          <label className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-3.5 py-2 cursor-pointer">
            <Upload className="w-4 h-4" /> {uploading ? "Uploading…" : "Upload"}
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-admin-gray-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border border-admin-gray-200 py-16 text-center text-admin-gray-400">No files found.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {items.map((item) => {
            const Icon = TYPE_ICONS[item.fileType];
            return (
              <div key={item.id} className={cn("bg-white rounded-lg border overflow-hidden", selected.has(item.id) ? "border-admin-primary ring-2 ring-admin-primary-lighter" : "border-admin-gray-200")}>
                <div className="relative aspect-square bg-admin-gray-50 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="absolute top-2 left-2 z-10 accent-admin-primary"
                  />
                  {item.fileType === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/${item.filePath}`} alt={item.altText ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    Icon && <Icon className="w-8 h-8 text-admin-gray-300" />
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs truncate" title={item.filePath.split("/").pop()}>{item.filePath.split("/").pop()}</div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <button onClick={() => setEditing(item)} className="flex-1 text-xs bg-admin-gray-100 hover:bg-admin-gray-200 rounded px-2 py-1">
                      <Pencil className="w-3 h-3 inline" />
                    </button>
                    <button onClick={() => deleteOne(item.id)} className="flex-1 text-xs bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded px-2 py-1">
                      <Trash2 className="w-3 h-3 inline" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)} className={cn("px-3 py-1.5 text-sm rounded", p === page ? "bg-admin-primary text-white" : "bg-white border border-admin-gray-200")}>
              {p}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-admin-gray-400 mt-3">{total} file(s) total.</p>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-lg max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold text-lg mb-4">Edit File Details</h5>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Alt Text</label>
                <input value={editing.altText ?? ""} onChange={(e) => setEditing({ ...editing, altText: e.target.value })} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Title</label>
                <input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Caption</label>
                <input value={editing.caption ?? ""} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <textarea rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">Cancel</button>
              <button onClick={() => saveMeta(editing)} className="px-4 py-2 text-sm rounded bg-admin-primary text-white hover:bg-admin-primary-dark">Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
