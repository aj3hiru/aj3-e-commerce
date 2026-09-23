"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Folder, FileText, Image as ImageIcon, FileType, UploadCloud, Search, ChevronDown, LayoutGrid, List,
  Plus, X, Loader2, CheckCircle2, AlertCircle, Pencil, Link2, Trash2, ExternalLink, FileQuestion,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { FileAsset } from "@/lib/file-manager2";

const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function src(relPath: string) { return `/${relPath}`; }
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Categories" }, { value: "media", label: "Blog Media" },
  { value: "product", label: "Product Images" }, { value: "category", label: "Category Icons" },
  { value: "brand", label: "Brand Logos" }, { value: "banner", label: "Homepage Banners" },
  { value: "payment", label: "Payment Icons" }, { value: "logo", label: "Site Logo" }, { value: "author", label: "Author Photos" },
];

function TypeIcon({ fileType, className }: { fileType: string; className?: string }) {
  if (fileType === "image") return <ImageIcon className={className} />;
  if (fileType === "pdf") return <FileType className={className} />;
  if (fileType === "document") return <FileText className={className} />;
  return <FileQuestion className={className} />;
}

export function FileManager2Grid({ files: initial }: { files: FileAsset[] }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [files, setFiles] = useState(initial);
  useEffect(() => setFiles(initial), [initial]);

  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [active, setActive] = useState<FileAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const notify = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 3500); };
  const fileInput = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => ({
    total: files.length,
    images: files.filter((f) => f.fileType === "image").length,
    pdfs: files.filter((f) => f.fileType === "pdf").length,
    assets: files.filter((f) => f.category !== "media").length,
  }), [files]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return files.filter((f) => {
      if (typeFilter !== "all" && f.fileType !== typeFilter) return false;
      if (categoryFilter !== "all" && f.category !== categoryFilter) return false;
      if (term && !`${f.name} ${f.usedBy ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [files, q, typeFilter, categoryFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === "newest") list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    else if (sort === "oldest") list.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    else if (sort === "largest") list.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [filtered, sort]);

  async function uploadFiles(fileList: FileList) {
    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of Array.from(fileList)) {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/media", { method: "POST", body: form }).then((r) => r.json()).catch(() => ({ error: "Network error" }));
      if (res.error) fail++; else ok++;
    }
    setUploading(false);
    notify(fail === 0, fail === 0 ? `${ok} file${ok === 1 ? "" : "s"} uploaded.` : `${ok} uploaded, ${fail} failed.`);
    if (ok) router.refresh();
  }

  async function renameFile(f: FileAsset, title: string) {
    const mediaId = f.id.split(":")[1];
    const ok = await fetch(`/api/media/${mediaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) })
      .then((r) => r.ok).catch(() => false);
    if (ok) { setFiles((l) => l.map((x) => (x.id === f.id ? { ...x, name: title } : x))); notify(true, "Renamed."); router.refresh(); }
    else notify(false, "Couldn't rename this file.");
  }

  async function deleteOne(f: FileAsset) {
    if (!confirm(`Delete "${f.name}"? This can't be undone.`)) return;
    const mediaId = f.id.split(":")[1];
    setBusy(true);
    const ok = await fetch(`/api/media/${mediaId}`, { method: "DELETE" }).then((r) => r.ok).catch(() => false);
    setBusy(false);
    if (ok) { setFiles((l) => l.filter((x) => x.id !== f.id)); setActive(null); notify(true, "File deleted."); router.refresh(); }
    else notify(false, "Couldn't delete this file.");
  }

  async function deleteSelected() {
    const ids = [...selected].filter((id) => files.find((f) => f.id === id)?.editable).map((id) => id.split(":")[1]);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} file(s)? This can't be undone.`)) return;
    setBusy(true);
    const res = await fetch("/api/media/bulk-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
      .then((r) => r.json()).catch(() => ({ success: false }));
    setBusy(false);
    if (res.success) { setFiles((l) => l.filter((x) => !selected.has(x.id))); setSelected(new Set()); notify(true, `${res.deleted} file(s) deleted.`); router.refresh(); }
    else notify(false, "Couldn't delete the selected files.");
  }

  function copyLink(f: FileAsset) {
    navigator.clipboard?.writeText(`${window.location.origin}/${f.relPath}`).catch(() => {});
    notify(true, "Link copied.");
  }

  const td = "px-3 py-2.5 align-middle";

  return (
    <div className={cn("mt-5 space-y-5", !loaded && "invisible")}>
      {show("fm2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {show("fm2-k-total") && <StatCard icon={FileText} tint="bg-violet-50 text-violet-600" value={stats.total} label="Total Files" />}
          {show("fm2-k-images") && <StatCard icon={ImageIcon} tint="bg-emerald-50 text-emerald-600" value={stats.images} label="Images" />}
          {show("fm2-k-pdfs") && <StatCard icon={FileType} tint="bg-red-50 text-red-500" value={stats.pdfs} label="PDFs" />}
          {show("fm2-k-assets") && <StatCard icon={Folder} tint="bg-amber-50 text-amber-600" value={stats.assets} label="Site Assets" />}
        </div>
      )}

      {show("fm2-upload") && show("fm2-upload-zone") && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); }}
          className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors", dragOver ? "border-[#2563eb] bg-blue-50/40" : "border-[#c7d2fe] bg-[#f7f8ff]")}
        >
          {uploading ? <Loader2 className="h-8 w-8 animate-spin text-[#2563eb]" /> : <UploadCloud className="h-8 w-8 text-[#2563eb]" />}
          <p className="text-sm text-admin-gray-700">
            {uploading ? "Uploading…" : <>Drag &amp; drop files here or <button type="button" onClick={() => fileInput.current?.click()} className="font-semibold text-[#2563eb] hover:underline">Browse to upload</button></>}
          </p>
          <p className="text-xs text-admin-gray-400">Images, PDFs, Videos, Audio, Docs, ZIPs — max 50MB</p>
          <input ref={fileInput} type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ""; }} />
        </div>
      )}

      {show("fm2-toolbar") && (
        <div className={cn(CARD, "flex flex-wrap items-center gap-3 p-4")}>
          {show("fm2-f-search") && (
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files…" className="h-10 w-full rounded-[0.375rem] border border-[#dee2e6] pl-9 pr-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
            </div>
          )}
          {show("fm2-f-type") && (
            <Select value={typeFilter} onChange={setTypeFilter} icon={FileType}>
              <option value="all">All Types</option><option value="image">Images</option><option value="pdf">PDFs</option>
              <option value="video">Videos</option><option value="document">Documents</option><option value="archive">Archives</option>
            </Select>
          )}
          {show("fm2-f-category") && (
            <Select value={categoryFilter} onChange={setCategoryFilter} icon={Folder}>
              {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
          {show("fm2-f-sort") && (
            <Select value={sort} onChange={setSort}>
              <option value="newest">Sort by: Newest</option><option value="oldest">Sort by: Oldest</option>
              <option value="largest">Sort by: Largest</option><option value="name">Sort by: Name</option>
            </Select>
          )}
          <button type="button" onClick={() => { setSelecting((s) => !s); setSelected(new Set()); }}
            className={cn("flex h-10 items-center gap-2 rounded-[0.375rem] border px-3 text-sm font-medium", selecting ? "border-[#2563eb] bg-blue-50 text-[#2563eb]" : "border-[#dee2e6] text-admin-gray-700 hover:bg-admin-gray-50")}>
            {selecting && <CheckCircle2 className="h-4 w-4" />} Select
          </button>
          {selecting && selected.size > 0 && (
            <button type="button" disabled={busy} onClick={deleteSelected} className="flex h-10 items-center gap-1.5 rounded-[0.375rem] border border-red-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Delete {selected.size}
            </button>
          )}
          <button type="button" onClick={() => fileInput.current?.click()} className="flex h-10 items-center gap-2 rounded-[0.5rem] bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4" /> Upload Files
          </button>
          <div className="flex items-center gap-1 rounded-[0.375rem] border border-[#dee2e6] p-1">
            <button type="button" onClick={() => setView("grid")} className={cn("flex h-8 w-8 items-center justify-center rounded-[0.25rem]", view === "grid" ? "bg-[#2563eb] text-white" : "text-admin-gray-500 hover:bg-admin-gray-50")}><LayoutGrid className="h-4 w-4" /></button>
            <button type="button" onClick={() => setView("list")} className={cn("flex h-8 w-8 items-center justify-center rounded-[0.25rem]", view === "list" ? "bg-[#2563eb] text-white" : "text-admin-gray-500 hover:bg-admin-gray-50")}><List className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        <div>
          {sorted.length === 0 ? (
            <div className={cn(CARD, "p-14 text-center text-sm text-admin-gray-400")}>No files match these filters.</div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {sorted.map((f) => (
                <div key={f.id} onClick={() => (selecting ? toggleSel(f.id, selected, setSelected) : setActive(f))}
                  className={cn(CARD, "cursor-pointer overflow-hidden transition-shadow hover:shadow-md", active?.id === f.id && "ring-2 ring-[#2563eb]")}>
                  <div className="relative aspect-[4/3] bg-admin-gray-50">
                    {selecting && (
                      <input type="checkbox" checked={selected.has(f.id)} onChange={(e) => { e.stopPropagation(); toggleSel(f.id, selected, setSelected); }}
                        className="absolute left-2 top-2 z-10 h-4 w-4 accent-[#2563eb]" onClick={(e) => e.stopPropagation()} />
                    )}
                    {f.fileType === "image" && f.sizeBytes !== null ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src(f.relPath)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-admin-gray-300">
                        <TypeIcon fileType={f.fileType} className="h-8 w-8" />
                        {f.sizeBytes === null && <span className="text-[10px] font-medium text-red-400">Missing on disk</span>}
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-xs font-semibold text-admin-gray-900">{f.name}</p>
                    <p className="truncate text-[11px] text-admin-gray-400">{f.categoryLabel} · {formatBytes(f.sizeBytes)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={cn(CARD, "overflow-hidden")}>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-admin-gray-100 bg-[#f8f9fa] text-left text-xs font-bold uppercase text-admin-gray-500"><th className={td}>Name</th><th className={td}>Category</th><th className={td}>Size</th><th className={td}>Date</th></tr></thead>
                <tbody>
                  {sorted.map((f) => (
                    <tr key={f.id} onClick={() => (selecting ? toggleSel(f.id, selected, setSelected) : setActive(f))} className={cn("cursor-pointer border-b border-admin-gray-50 last:border-0 hover:bg-admin-gray-50", active?.id === f.id && "bg-blue-50/60")}>
                      <td className={cn(td, "flex items-center gap-2.5")}>
                        {selecting && <input type="checkbox" checked={selected.has(f.id)} onChange={(e) => { e.stopPropagation(); toggleSel(f.id, selected, setSelected); }} onClick={(e) => e.stopPropagation()} className="h-4 w-4 accent-[#2563eb]" />}
                        <TypeIcon fileType={f.fileType} className="h-4 w-4 shrink-0 text-admin-gray-400" /> <span className="truncate font-medium text-admin-gray-900">{f.name}</span>
                      </td>
                      <td className={cn(td, "text-admin-gray-600")}>{f.categoryLabel}</td>
                      <td className={cn(td, "text-admin-gray-600")}>{formatBytes(f.sizeBytes)}</td>
                      <td className={cn(td, "text-admin-gray-500")}>{f.createdAt ? new Date(f.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {active && <DetailPanel file={active} onClose={() => setActive(null)} onRename={renameFile} onDelete={deleteOne} onCopyLink={copyLink} busy={busy} />}
      </div>

      {toast && (
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

function toggleSel(id: string, selected: Set<string>, setSelected: (s: Set<string>) => void) {
  const n = new Set(selected);
  if (n.has(id)) n.delete(id); else n.add(id);
  setSelected(n);
}

function StatCard({ icon: Icon, tint, value, label }: { icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string }) {
  return (
    <div className={cn(CARD, "flex items-center gap-4 px-5 py-4")}>
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0"><span className="block text-2xl font-bold leading-tight text-admin-gray-900">{value.toLocaleString("en-IN")}</span><span className="block text-sm text-admin-gray-600">{label}</span></span>
    </div>
  );
}

function Select({ value, onChange, children, icon: Icon }: { value: string; onChange: (v: string) => void; children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <span className="relative flex h-10 items-center gap-2 rounded-[0.375rem] border border-[#dee2e6] bg-white pl-3 pr-8 text-sm">
      {Icon && <Icon className="h-3.5 w-3.5 text-admin-gray-400" />}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-transparent font-medium text-admin-gray-900 focus:outline-none">{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-500" />
    </span>
  );
}

function DetailPanel({ file: f, onClose, onRename, onDelete, onCopyLink, busy }: {
  file: FileAsset; onClose: () => void; onRename: (f: FileAsset, name: string) => void; onDelete: (f: FileAsset) => void; onCopyLink: (f: FileAsset) => void; busy: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(f.name);
  useEffect(() => setName(f.name), [f]);

  return (
    <aside className={cn(CARD, "sticky top-4 h-fit overflow-hidden")}>
      <div className="relative flex h-40 items-center justify-center bg-admin-gray-50">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-admin-gray-500 shadow hover:bg-white"><X className="h-4 w-4" /></button>
        {f.fileType === "image" && f.sizeBytes !== null ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src(f.relPath)} alt="" className="h-full w-full object-cover" />
        ) : <TypeIcon fileType={f.fileType} className="h-12 w-12 text-admin-gray-300" />}
      </div>
      <div className="p-5">
        {renaming ? (
          <div className="mb-1 flex items-center gap-1.5">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1 rounded-[0.375rem] border border-[#dee2e6] px-2 text-sm" />
            <button type="button" onClick={() => { onRename(f, name); setRenaming(false); }} className="text-xs font-semibold text-[#2563eb]">Save</button>
          </div>
        ) : (
          <h3 className="mb-1 break-words text-base font-bold text-admin-gray-900">{f.name}</h3>
        )}
        <p className="mb-4 text-sm text-admin-gray-500">{f.fileType.toUpperCase()} · {formatBytes(f.sizeBytes)}</p>

        <h4 className="mb-2 text-xs font-bold uppercase text-admin-gray-400">File Information</h4>
        <div className="mb-4 space-y-2 text-sm">
          <Row label="Category" value={f.categoryLabel} />
          <Row label="Size" value={formatBytes(f.sizeBytes)} />
          {f.createdAt && <Row label="Created" value={new Date(f.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })} />}
          <Row label="Location" value={`/${f.relPath}`} mono />
          {f.usedBy && <Row label="Used by" value={f.usedBy} />}
          {f.sizeBytes === null && <p className="rounded-[0.375rem] bg-red-50 px-2.5 py-1.5 text-xs text-red-600">This file is referenced in the database but missing on disk.</p>}
        </div>

        <h4 className="mb-2 text-xs font-bold uppercase text-admin-gray-400">Actions</h4>
        <div className="space-y-1">
          {f.editable ? (
            <>
              <ActionRow icon={Pencil} label="Rename" onClick={() => setRenaming(true)} />
              <ActionRow icon={Link2} label="Copy link" onClick={() => onCopyLink(f)} />
              <ActionRow icon={Trash2} label="Delete" danger onClick={() => onDelete(f)} disabled={busy} />
            </>
          ) : (
            <>
              <ActionRow icon={Link2} label="Copy link" onClick={() => onCopyLink(f)} />
              {f.manageUrl && <ActionRow icon={ExternalLink} label={`Open in ${f.categoryLabel.split(" ")[0]}`} href={f.manageUrl} />}
              <p className="px-1 pt-2 text-[11px] leading-relaxed text-admin-gray-400">Managed from its own page — edit or replace it there so nothing gets orphaned.</p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-admin-gray-500">{label}</span>
      <span className={cn("truncate text-right font-medium text-admin-gray-900", mono && "font-mono text-xs")} title={value}>{value}</span>
    </div>
  );
}

function ActionRow({ icon: Icon, label, onClick, href, danger, disabled }: {
  icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; href?: string; danger?: boolean; disabled?: boolean;
}) {
  const cls = cn("flex w-full items-center gap-2.5 rounded-[0.375rem] px-2.5 py-2 text-sm font-medium", danger ? "text-red-600 hover:bg-red-50" : "text-admin-gray-700 hover:bg-admin-gray-50", disabled && "opacity-50 pointer-events-none");
  if (href) return <a href={href} className={cls}><Icon className="h-4 w-4" /> {label}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}><Icon className="h-4 w-4" /> {label}</button>;
}
