"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  LayoutGrid, CheckCircle2, XCircle, Boxes, ImageIcon, ChevronDown, ChevronLeft, ChevronRight, Download, Upload,
  Plus, SquarePen, Trash2, Loader2, AlertCircle, X, Layers, ArrowUp, ArrowDown, ChevronsUpDown, CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { ActionMenu, IconAction, StatusPill, type PillOption } from "@/components/admin/ui/buttons";

const CATEGORY_STATUS: readonly PillOption<"active" | "inactive">[] = [
  { value: "active", label: "Active", variant: "success" },
  { value: "inactive", label: "Inactive", variant: "secondary" },
];

/* ───────────────────────── types ───────────────────────── */

export interface Category2Row {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  metaKeywords: string | null;
  metaDescription: string | null;
  serial: number;
  status: string; // "active" | "inactive"
  products: number;
  updatedAt: string | null; // ISO
}

type SortKey = "name" | "slug" | "products" | "serial" | "updatedAt";
interface Filters { status: "all" | "active" | "inactive" }
const NO_FILTERS: Filters = { status: "all" };
const SORTS: { value: string; key: SortKey; dir: "asc" | "desc"; label: string }[] = [
  { value: "newest", key: "updatedAt", dir: "desc", label: "Newest First" },
  { value: "oldest", key: "updatedAt", dir: "asc", label: "Oldest First" },
  { value: "name-asc", key: "name", dir: "asc", label: "Name (A–Z)" },
  { value: "name-desc", key: "name", dir: "desc", label: "Name (Z–A)" },
  { value: "serial", key: "serial", dir: "asc", label: "Serial" },
  { value: "products", key: "products", dir: "desc", label: "Most Products" },
];

/** Header buttons (in the AdminShell header) talk to the body through these events. */
const EVT_ADD = "categories2:add";
const EVT_EXPORT = "categories2:export";
const EVT_IMPORT = "categories2:import";

/* ───────────────────────── header controls ───────────────────────── */

export function Categories2HeaderButtons() {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={fileRef} type="file" accept=".csv" className="sr-only" aria-label="Import categories CSV"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) window.dispatchEvent(new CustomEvent(EVT_IMPORT, { detail: f })); e.target.value = ""; }} />
      <button type="button" onClick={() => fileRef.current?.click()}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#dee2e6] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
        <Upload className="h-4 w-4" /> Import
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_EXPORT))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#dee2e6] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
        <Download className="h-4 w-4" /> Export
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_ADD))}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-[#2563eb] px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]">
        <Plus className="h-4 w-4" /> Add Category
      </button>
    </>
  );
}

/* ───────────────────────── body ───────────────────────── */

const ROW_H = 76;
const HEAD_H = 50;
const MIN_ROWS = 5;

export function Categories2Body({ categories: initial }: { categories: Category2Row[] }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();

  const [categories, setCategories] = useState(initial);
  useEffect(() => setCategories(initial), [initial]);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [sortValue, setSortValue] = useState("newest");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Category2Row | "new" | null>(null);
  const [confirm, setConfirm] = useState<Category2Row[] | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => ({
    total: categories.length,
    active: categories.filter((c) => c.status === "active").length,
    inactive: categories.filter((c) => c.status !== "active").length,
    products: categories.reduce((s, c) => s + c.products, 0),
  }), [categories]);

  const sort = SORTS.find((s) => s.value === sortValue) ?? SORTS[0];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = categories.filter((c) => {
      if (filters.status !== "all" && c.status !== filters.status) return false;
      if (term && !`${c.name} ${c.slug}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const v = (c: Category2Row) => {
      if (sort.key === "products") return c.products;
      if (sort.key === "serial") return c.serial;
      if (sort.key === "updatedAt") return c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return c[sort.key].toLowerCase();
    };
    return [...list].sort((a, b) => {
      const cmp = v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : b.id - a.id;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [categories, filters, q, sort]);

  useEffect(() => setPage(1), [filters, q, sortValue, pageSize]);
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(categories.map((c) => c.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [categories]);

  const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = pageSize === 0 ? 0 : (current - 1) * pageSize;
  const rows = pageSize === 0 ? filtered : filtered.slice(start, start + pageSize);
  const filtersActive = filters.status !== "all" || search.trim() !== "";

  function exportCsv(list: Category2Row[]) {
    const cell = (v: string | number) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [["ID", "Name", "Slug", "Products", "Serial", "Status", "Last Updated"].join(",")];
    for (const c of list) lines.push([c.id, c.name, c.slug, c.products, c.serial, c.status === "active" ? "Active" : "Inactive", c.updatedAt ?? ""].map(cell).join(","));
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `categories-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Import: name[,slug][,serial][,status] per row, header row optional. Creates
   *  new categories only — existing names are skipped, matching the "safe to
   *  re-run" spirit of the rest of this project's import/migration tooling. */
  async function importCsv(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length && /^["']?name["']?\s*,/i.test(lines[0])) lines.shift();
      const existing = new Set(categories.map((c) => c.name.toLowerCase()));
      let created = 0, skipped = 0, failed = 0;
      for (const line of lines) {
        const [nameRaw, slugRaw, serialRaw, statusRaw] = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
        if (!nameRaw) continue;
        if (existing.has(nameRaw.toLowerCase())) { skipped++; continue; }
        const form = new FormData();
        form.set("name", nameRaw);
        if (slugRaw) form.set("slug", slugRaw);
        if (serialRaw) form.set("serial", serialRaw);
        form.set("status", /inactive/i.test(statusRaw ?? "") ? "inactive" : "active");
        const ok = await fetch("/api/ecommerce/categories2", { method: "POST", body: form })
          .then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true)
          .catch(() => false);
        if (ok) { created++; existing.add(nameRaw.toLowerCase()); } else failed++;
      }
      setToast({ ok: failed === 0, text: `Import finished: ${created} added, ${skipped} skipped (already exist)${failed ? `, ${failed} failed` : ""}.` });
      if (created) router.refresh();
    } catch {
      setToast({ ok: false, text: "Couldn't read that file. Use a CSV with a name column." });
    } finally {
      setImporting(false);
    }
  }

  const markBusy = (ids: number[], on: boolean) =>
    setBusy((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  async function patch(ids: number[], change: { status?: "active" | "inactive" }, label: string) {
    const todo = ids.filter((id) => {
      const c = categories.find((x) => x.id === id);
      return c && change.status && c.status !== change.status;
    });
    if (!todo.length) return setToast({ ok: true, text: "Nothing to change." });
    const before = new Map(categories.filter((c) => todo.includes(c.id)).map((c) => [c.id, c]));
    setCategories((list) => list.map((c) => (todo.includes(c.id) ? { ...c, ...change } : c)));
    markBusy(todo, true);
    const failed: number[] = [];
    for (let i = 0; i < todo.length; i += 4) {
      const chunk = todo.slice(i, i + 4);
      const res = await Promise.all(chunk.map((id) =>
        fetch(`/api/ecommerce/categories2/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) })
          .then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true)
          .catch(() => false)
      ));
      res.forEach((ok, j) => !ok && failed.push(chunk[j]));
    }
    markBusy(todo, false);
    if (failed.length) setCategories((list) => list.map((c) => (failed.includes(c.id) ? before.get(c.id)! : c)));
    const done = todo.length - failed.length;
    setToast(failed.length
      ? { ok: false, text: todo.length === 1 ? "Couldn't save the change. Please try again." : `${done} updated, ${failed.length} failed. Please try again.` }
      : { ok: true, text: todo.length === 1 ? `"${before.get(todo[0])!.name}" ${label}.` : `${done} categories ${label}.` });
    router.refresh();
  }

  async function remove(list: Category2Row[], detach: boolean) {
    setConfirm(null);
    const ids = list.map((c) => c.id);
    markBusy(ids, true);
    const ok: number[] = [];
    const failed: string[] = [];
    for (const c of list) {
      const res = await fetch(`/api/ecommerce/categories2/${c.id}${detach ? "?detach=1" : ""}`, { method: "DELETE" })
        .then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true)
        .catch(() => false);
      if (res) ok.push(c.id);
      else failed.push(c.name);
    }
    markBusy(ids, false);
    if (ok.length) setCategories((l) => l.filter((c) => !ok.includes(c.id)));
    setToast(failed.length
      ? { ok: false, text: `${ok.length ? `${ok.length} deleted. ` : ""}Couldn't delete ${failed.slice(0, 2).map((n) => `"${n}"`).join(", ")}${failed.length > 2 ? ` and ${failed.length - 2} more` : ""}.` }
      : { ok: true, text: ok.length === 1 ? `"${list[0].name}" deleted.` : `${ok.length} categories deleted.` });
    router.refresh();
  }

  // Header buttons.
  const exportRef = useRef<() => void>(() => {});
  exportRef.current = () => exportCsv(filtered);
  const importRef = useRef<(f: File) => void>(() => {});
  importRef.current = (f) => importCsv(f);
  useEffect(() => {
    const onAdd = () => setEditing("new");
    const onExport = () => exportRef.current();
    const onImport = (e: Event) => importRef.current((e as CustomEvent<File>).detail);
    window.addEventListener(EVT_ADD, onAdd);
    window.addEventListener(EVT_EXPORT, onExport);
    window.addEventListener(EVT_IMPORT, onImport);
    return () => {
      window.removeEventListener(EVT_ADD, onAdd);
      window.removeEventListener(EVT_EXPORT, onExport);
      window.removeEventListener(EVT_IMPORT, onImport);
    };
  }, []);

  function toggleSort(k: SortKey) {
    const asc = SORTS.find((s) => s.key === k && s.dir === "asc");
    const desc = SORTS.find((s) => s.key === k && s.dir === "desc");
    if (sort.key !== k) return setSortValue((desc ?? asc)!.value);
    setSortValue(sort.dir === "asc" ? (desc?.value ?? asc!.value) : (asc?.value ?? desc!.value));
  }
  function toggleSel(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const pageAll = rows.length > 0 && rows.every((c) => selected.has(c.id));
  const selRows = categories.filter((c) => selected.has(c.id));

  const COLS: { key: string; label: string; width?: string; sort?: SortKey }[] = [
    { key: "c2-c-select", label: "", width: "w-[44px] min-[1500px]:w-[52px]" },
    { key: "c2-c-image", label: "Image", width: "w-[88px] min-[1500px]:w-[110px]" },
    { key: "c2-c-name", label: "Category Name", sort: "name" },
    { key: "c2-c-slug", label: "Slug", width: "w-[124px] min-[1500px]:w-[18%]", sort: "slug" },
    { key: "c2-c-products", label: "Products", width: "w-[104px] min-[1500px]:w-[130px]", sort: "products" },
    { key: "c2-c-serial", label: "Serial", width: "w-[90px] min-[1500px]:w-[110px]", sort: "serial" },
    { key: "c2-c-status", label: "Status", width: "w-[130px] min-[1500px]:w-[150px]" },
    { key: "c2-c-updated", label: "Last Updated", width: "w-[150px] min-[1500px]:w-[170px]", sort: "updatedAt" },
    { key: "c2-c-actions", label: "Actions", width: "w-[100px] min-[1500px]:w-[110px]" },
  ];
  const cols = COLS.filter((c) => show("c2-table") && show(c.key));
  const cardKeys = ["c2-k-total", "c2-k-active", "c2-k-inactive", "c2-k-products"].filter(show);
  const td = "border border-[#dee2e6] px-3 align-middle";

  return (
    <div className={cn("space-y-5", !loaded && "invisible")}>
      {/* ── summary cards ── */}
      {show("c2-cards") && cardKeys.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {show("c2-k-total") && <StatCard icon={LayoutGrid} tint="bg-violet-50 text-violet-600" value={stats.total} label="Total Categories" active={!filtersActive} onClick={() => { setFilters(NO_FILTERS); setSearch(""); }} />}
          {show("c2-k-active") && <StatCard icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" value={stats.active} label="Active Categories" active={filters.status === "active"} onClick={() => setFilters((f) => ({ status: f.status === "active" ? "all" : "active" }))} />}
          {show("c2-k-inactive") && <StatCard icon={XCircle} tint="bg-red-50 text-red-500" value={stats.inactive} label="Inactive Categories" active={filters.status === "inactive"} onClick={() => setFilters((f) => ({ status: f.status === "inactive" ? "all" : "inactive" }))} />}
          {show("c2-k-products") && <StatCard icon={Boxes} tint="bg-blue-50 text-blue-600" value={stats.products} label="Products Assigned" active={false} onClick={() => {}} />}
        </div>
      )}

      {/* ── categories table ── */}
      {show("c2-table") && (
        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            {show("c2-t-search") && (
              <div className="relative min-w-[220px] flex-1 sm:flex-none sm:w-[260px]">
                <CircleDot className="pointer-events-none absolute left-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories…" aria-label="Search categories"
                  className="h-10 w-full rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
              </div>
            )}

            {show("c2-filters") && show("c2-f-status") && (
              <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters({ status: v as Filters["status"] })}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </FilterSelect>
            )}

            {show("c2-filters") && show("c2-f-sort") && (
              <FilterSelect label="Sort by" value={sortValue} onChange={setSortValue}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </FilterSelect>
            )}

            {show("c2-c-select") && (
              <div className="flex items-center gap-2">
                <ActionMenu
                  label="Bulk actions"
                  title={selected.size === 0 ? "Select categories first" : undefined}
                  disabled={selected.size === 0}
                  trigger={<><Layers className="h-3.5 w-3.5" /> Bulk actions</>}
                  items={[
                    { label: "Activate", onClick: () => patch([...selected], { status: "active" }, "activated") },
                    { label: "Deactivate", onClick: () => patch([...selected], { status: "inactive" }, "deactivated") },
                    { label: "Export selected (CSV)", onClick: () => exportCsv(selRows) },
                    { label: "Delete", danger: true, onClick: () => setConfirm(selRows) },
                  ]}
                />
                <span className="text-[13px] text-admin-gray-500">{selected.size} selected</span>
              </div>
            )}

            {filtersActive && (
              <button type="button" onClick={() => { setFilters(NO_FILTERS); setSearch(""); }} className="flex items-center gap-1 text-[13px] font-medium text-[#2563eb] hover:underline">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}

            {importing && <span className="ml-auto flex items-center gap-1.5 text-[13px] text-admin-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</span>}
          </div>

          {cols.length === 0 ? (
            <p className="py-10 text-center text-sm text-admin-gray-400">All table columns are hidden — turn them on from Display Options.</p>
          ) : (
            <div className="overflow-x-auto" style={{ minHeight: pageSize === 0 ? undefined : HEAD_H + Math.min(pageSize, MIN_ROWS) * ROW_H }}>
              <table className="w-full min-w-[920px] table-fixed border-collapse text-[15px]">
                <colgroup>{cols.map((c) => <col key={c.key} className={c.width} />)}</colgroup>
                <thead>
                  <tr className="bg-[#f8f9fa] text-left" style={{ height: HEAD_H }}>
                    {cols.map((c) =>
                      c.key === "c2-c-select" ? (
                        <th key={c.key} className={cn(td, "text-center")}>
                          <input type="checkbox" checked={pageAll} aria-label="Select categories on this page" className="h-4 w-4 accent-[#2563eb]"
                            onChange={(e) => setSelected((s) => { const n = new Set(s); rows.forEach((c) => (e.target.checked ? n.add(c.id) : n.delete(c.id))); return n; })} />
                        </th>
                      ) : (
                        <th key={c.key} className={cn(td, "font-bold text-admin-gray-900")} aria-sort={c.sort && sort.key === c.sort ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                          {c.sort ? (
                            <button type="button" onClick={() => toggleSort(c.sort!)} className="flex w-full items-center justify-between gap-2 font-bold">
                              {c.label}
                              {sort.key === c.sort
                                ? sort.dir === "asc" ? <ArrowUp className="h-4 w-4 text-admin-gray-600" /> : <ArrowDown className="h-4 w-4 text-admin-gray-600" />
                                : <ChevronsUpDown className="h-4 w-4 text-admin-gray-300" />}
                            </button>
                          ) : c.label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={cols.length} className={cn(td, "py-12 text-center text-admin-gray-400")}>
                      {categories.length === 0 ? <>No categories yet. <button type="button" onClick={() => setEditing("new")} className="font-semibold text-[#2563eb] hover:underline">Add your first category</button></> : "No categories match these filters."}
                    </td></tr>
                  ) : rows.map((c) => {
                    const isBusy = busy.has(c.id);
                    return (
                      <tr key={c.id} style={{ height: ROW_H }} className={cn(selected.has(c.id) ? "bg-blue-50/60" : "odd:bg-[#f2f2f2] even:bg-white", isBusy && "opacity-60")}>
                        {show("c2-c-select") && (
                          <td className={cn(td, "text-center")}>
                            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} aria-label={`Select ${c.name}`} className="h-4 w-4 accent-[#2563eb]" />
                          </td>
                        )}
                        {show("c2-c-image") && <td className={td}><Thumb src={c.image} name={c.name} /></td>}
                        {show("c2-c-name") && (
                          <td className={td}>
                            <button type="button" onClick={() => setEditing(c)} title={`Edit ${c.name}`} className="block max-w-full truncate text-left font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">
                              {c.name}
                            </button>
                          </td>
                        )}
                        {show("c2-c-slug") && <td className={cn(td, "truncate text-admin-gray-500")} title={c.slug}>{c.slug}</td>}
                        {show("c2-c-products") && (
                          <td className={td}>
                            {c.products > 0 ? (
                              <a href={`/admin/ecommerce/products?q=${encodeURIComponent(c.name)}`} title="See these products" className="hover:text-[#2563eb] hover:underline">{c.products.toLocaleString("en-IN")}</a>
                            ) : <span>0</span>}
                          </td>
                        )}
                        {show("c2-c-serial") && <td className={td}>{String(c.serial).padStart(3, "0")}</td>}
                        {show("c2-c-status") && (
                          <td className={td}>
                            <StatusPill
                              label={`Change status of ${c.name}`}
                              value={c.status === "active" ? "active" : "inactive"}
                              options={CATEGORY_STATUS}
                              disabled={isBusy}
                              onChange={(next) => patch([c.id], { status: next }, next === "active" ? "activated" : "deactivated")}
                            />
                          </td>
                        )}
                        {show("c2-c-updated") && (
                          <td className={cn(td, "text-admin-gray-600")}>
                            {c.updatedAt
                              ? new Date(c.updatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
                              : <span className="text-admin-gray-300">—</span>}
                          </td>
                        )}
                        {show("c2-c-actions") && (
                          <td className={td}>
                            <div className="flex items-center gap-[0.4rem]">
                              <IconAction tone="edit" onClick={() => setEditing(c)} title={`Edit ${c.name}`}><SquarePen /></IconAction>
                              <ActionMenu
                                trigger={<span className="text-lg leading-none">⋯</span>}
                                label="More actions"
                                items={[
                                  { label: "View products", onClick: () => router.push(`/admin/ecommerce/products?q=${encodeURIComponent(c.name)}`) },
                                  { label: "Delete", danger: true, onClick: () => setConfirm([c]), disabled: isBusy },
                                ]}
                              />
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-3 text-[15px] text-admin-gray-800">
            <label className="flex items-center gap-2 text-sm">
              Show
              <span className="relative">
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Entries per page"
                  className="h-9 w-[80px] appearance-none rounded-[0.375rem] border border-[#dee2e6] bg-white pl-3 pr-7 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15">
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value={0}>All</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-600" />
              </span>
              per page
            </label>
            <span>
              {filtered.length === 0 ? "Showing 0 entries" : `Showing ${start + 1} to ${start + rows.length} of ${filtered.length} entries`}
              {filtered.length !== categories.length && <span className="text-admin-gray-500"> (filtered from {categories.length} total)</span>}
            </span>
            {pageCount > 1 && <Pager page={current} pageCount={pageCount} onPage={setPage} />}
          </div>
        </section>
      )}

      {editing && (
        <CategoryModal
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name, isNew) => {
            setEditing(null);
            setToast({ ok: true, text: `"${name}" ${isNew ? "added" : "saved"}.` });
            router.refresh();
          }}
          onDelete={editing === "new" ? undefined : () => { const c = editing; setEditing(null); setConfirm([c]); }}
        />
      )}
      {confirm && <ConfirmDelete list={confirm} onCancel={() => setConfirm(null)} onConfirm={(detach) => remove(confirm, detach)} />}
      {toast && createPortal(
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Thumb({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    setBroken(!!el && el.complete && el.naturalWidth === 0);
  }, [src]);
  if (!src || broken) {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-[0.375rem] bg-admin-gray-100 text-admin-gray-300" title={src ? "Image file is missing" : "No image"}>
        <ImageIcon className="h-5 w-5" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src.startsWith("http") || src.startsWith("blob:") ? src : `/${src}`} ref={img} alt="" title={name} onError={() => setBroken(true)} className="h-12 w-12 rounded-[0.375rem] border border-admin-gray-200 object-cover" />;
}

function StatCard({ icon: Icon, tint, value, label, active, onClick }: {
  icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={`Show ${label.toLowerCase()}`}
      className={cn("flex items-center gap-4 rounded-xl border bg-white px-5 py-4 text-left shadow-sm transition-colors", active ? "border-[#2563eb]/40 ring-1 ring-[#2563eb]/25" : "border-admin-gray-200 hover:border-[#2563eb]/30")}>
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-tight text-admin-gray-900">{value.toLocaleString("en-IN")}</span>
        <span className="block text-sm text-admin-gray-600">{label}</span>
      </span>
    </button>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="relative flex h-10 min-w-[160px] cursor-pointer items-center gap-2 rounded-[0.375rem] border border-[#dee2e6] bg-white pl-3 pr-8 text-sm focus-within:ring-4 focus-within:ring-[#0d6efd]/15">
      <span className="text-admin-gray-500">{label}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent font-medium text-admin-gray-900 focus:outline-none">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-500" />
    </label>
  );
}

/** DataTables-style pager: Previous · 1 2 3 · Next */
function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "flex h-10 min-w-10 items-center justify-center border border-[#dee2e6] px-3 text-sm -ml-px first:ml-0 first:rounded-l-[0.375rem] last:rounded-r-[0.375rem]";
  return (
    <nav className="flex" aria-label="Category pages">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-transparent")}><ChevronLeft className="h-4 w-4" /></button>
      {nums.map((n, i) => n === "…"
        ? <span key={`e${i}`} className={cn(btn, "text-admin-gray-400")}>…</span>
        : <button key={n} type="button" aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}
            className={cn(btn, n === page ? "relative z-10 border-[#2563eb] bg-[#2563eb] text-white" : "text-[#2563eb] hover:bg-admin-gray-50")}>{n}</button>)}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={cn(btn, "gap-1 text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-transparent")}><ChevronRight className="h-4 w-4" /></button>
    </nav>
  );
}

/** Add / Edit Category — name, slug, image, meta fields, serial, status. */
function CategoryModal({ category, onClose, onSaved, onDelete }: {
  category: Category2Row | null;
  onClose: () => void;
  onSaved: (name: string, isNew: boolean) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [metaKeywords, setMetaKeywords] = useState(category?.metaKeywords ?? "");
  const [metaDescription, setMetaDescription] = useState(category?.metaDescription ?? "");
  const [serial, setSerial] = useState(String(category?.serial ?? 0));
  const [status, setStatus] = useState(category?.status === "inactive" ? "inactive" : "active");
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const toSlug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const preview = file ? URL.createObjectURL(file) : removeImage ? null : category?.image ? (category.image.startsWith("http") ? category.image : `/${category.image}`) : null;
  useEffect(() => () => { if (file) URL.revokeObjectURL(preview!); }, [file, preview]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.set("name", name);
    form.set("slug", slug);
    form.set("meta_keywords", metaKeywords);
    form.set("meta_description", metaDescription);
    form.set("serial", serial);
    form.set("status", status);
    if (file) form.set("image", file);
    if (removeImage) form.set("remove_image", "1");
    try {
      const res = await fetch(category ? `/api/ecommerce/categories2/${category.id}` : "/api/ecommerce/categories2", {
        method: category ? "PUT" : "POST",
        body: form,
      });
      const data = await res.json();
      if (!data.success) {
        setErr({ text: data.message, field: data.field });
        setBusy(false);
        return;
      }
      onSaved(data.name, !category);
    } catch {
      setErr({ text: "Could not reach the server. Please try again." });
      setBusy(false);
    }
  }

  const inputCls = (bad: boolean) => cn("h-11 w-full rounded-[0.375rem] border px-3 text-[15px] outline-none transition-[border-color,box-shadow]",
    bad ? "border-red-400 focus:ring-4 focus:ring-red-100" : "border-[#dee2e6] focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15");

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <form onSubmit={save} role="dialog" aria-modal="true" aria-label={category ? "Edit Category" : "Add New Category"} noValidate
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#dee2e6] bg-[#f8f9fa] px-6 py-4">
          <h5 className="text-xl font-semibold text-admin-gray-900">{category ? "Edit Category" : "Add New Category"}</h5>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-admin-gray-500 hover:bg-admin-gray-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {category && category.products > 0 && (
            <div className="flex items-center justify-between rounded-[0.5rem] border border-[#dee2e6] bg-[#f8f9fa] px-3 py-2.5 text-sm text-admin-gray-700">
              <span>{category.products.toLocaleString("en-IN")} product{category.products === 1 ? "" : "s"} in this category · ID #{category.id}</span>
              <a href={`/admin/ecommerce/products?q=${encodeURIComponent(category.name)}`} className="text-xs font-medium text-[#2563eb] hover:underline">View</a>
            </div>
          )}
          {err && <div role="alert" className="rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err.text}</div>}
          <div>
            <label htmlFor="c2-name" className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Category Name</label>
            <input id="c2-name" autoFocus value={name} maxLength={150} placeholder="e.g. Health Care"
              onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(toSlug(e.target.value)); if (err?.field === "name") setErr(null); }}
              className={inputCls(err?.field === "name")} />
          </div>
          <div>
            <label htmlFor="c2-slug" className="mb-1.5 flex items-baseline justify-between text-[15px] font-medium text-admin-gray-900">
              Slug <span className="text-xs font-normal text-admin-gray-400">Made from the name automatically</span>
            </label>
            <input id="c2-slug" value={slug} maxLength={170} placeholder="auto-generated"
              onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")); setSlugTouched(e.target.value !== ""); }}
              className={inputCls(false)} />
          </div>
          <div>
            <span className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Image <span className="text-sm font-normal text-admin-gray-500">(optional)</span></span>
            <div className="flex items-center gap-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-16 w-16 rounded-[0.375rem] border border-admin-gray-200 object-cover" />
              ) : (
                <button type="button" onClick={() => input.current?.click()} className="flex h-16 w-16 items-center justify-center rounded-[0.375rem] border-2 border-dashed border-[#dee2e6] text-admin-gray-400 hover:border-[#2563eb] hover:text-[#2563eb]" aria-label="Choose image">
                  <Upload className="h-5 w-5" />
                </button>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => input.current?.click()} className="h-9 rounded-[0.375rem] border border-[#dee2e6] bg-[#f8f9fa] px-3 text-sm font-medium text-admin-gray-800 hover:bg-admin-gray-100">
                  {preview ? "Change" : "Choose file"}
                </button>
                {preview && (
                  <button type="button" onClick={() => { if (file) setFile(null); else setRemoveImage(true); }} className="h-9 rounded-[0.375rem] px-2 text-sm font-medium text-red-600 hover:bg-red-50">Remove</button>
                )}
                {removeImage && !file && category?.image && <button type="button" onClick={() => setRemoveImage(false)} className="h-9 px-2 text-sm text-[#2563eb] hover:underline">Undo</button>}
              </div>
              <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="Category image"
                onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) setRemoveImage(false); }} />
            </div>
            <p className="mt-1.5 text-xs text-admin-gray-400">{file ? file.name : "JPG, PNG, WebP or SVG · up to 2 MB"}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="c2-serial" className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Serial</label>
              <input id="c2-serial" type="number" min={0} value={serial} onChange={(e) => setSerial(e.target.value)} className={inputCls(false)} />
            </div>
            <Toggle label="Status" on={status === "active"} onLabel="Active" offLabel="Inactive" onChange={(v) => setStatus(v ? "active" : "inactive")} />
          </div>
          <div>
            <label htmlFor="c2-meta-kw" className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Meta Keywords <span className="text-sm font-normal text-admin-gray-500">(optional)</span></label>
            <input id="c2-meta-kw" value={metaKeywords} onChange={(e) => setMetaKeywords(e.target.value)} placeholder="comma, separated, keywords" className={inputCls(false)} />
          </div>
          <div>
            <label htmlFor="c2-meta-desc" className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Meta Description <span className="text-sm font-normal text-admin-gray-500">(optional)</span></label>
            <textarea id="c2-meta-desc" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={3}
              className="w-full resize-none rounded-[0.375rem] border border-[#dee2e6] px-3 py-2.5 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15" />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-[#dee2e6] px-6 py-4">
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={busy} className="mr-auto flex h-10 items-center gap-1.5 rounded-[0.375rem] px-3 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button type="button" onClick={onClose} disabled={busy} className={cn("h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-[15px] font-medium text-white hover:bg-[#5c636a]", !onDelete && "ml-auto")}>Cancel</button>
          <button type="submit" disabled={busy} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-[15px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {category ? "Save Changes" : "Add Category"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

function Toggle({ label, on, onLabel, offLabel, onChange }: { label: string; on: boolean; onLabel: string; offLabel: string; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">{label}</span>
      <div className="grid grid-cols-2 rounded-[0.375rem] border border-[#dee2e6] p-1" role="group" aria-label={label}>
        {[true, false].map((v) => (
          <button key={String(v)} type="button" aria-pressed={on === v} onClick={() => onChange(v)}
            className={cn("h-8 rounded-[0.25rem] text-sm font-medium transition-colors", on === v ? (v ? "bg-[#5cc28a] text-white" : "bg-[#8a8f98] text-white") : "text-admin-gray-600 hover:bg-admin-gray-50")}>
            {v ? onLabel : offLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfirmDelete({ list, onCancel, onConfirm }: { list: Category2Row[]; onCancel: () => void; onConfirm: (detach: boolean) => void }) {
  const used = list.reduce((s, c) => s + c.products, 0);
  const [detach, setDetach] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const what = list.length === 1 ? `"${list[0].name}"` : `${list.length} categories`;
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label="Delete category" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h5 className="mb-2 flex items-center gap-2 text-lg font-bold text-admin-gray-900"><Trash2 className="h-5 w-5 text-red-500" /> Delete {what}?</h5>
        <p className="text-sm text-admin-gray-600">This can&apos;t be undone.</p>
        {used > 0 && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-[0.5rem] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" checked={detach} onChange={(e) => setDetach(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" />
            <span>
              <b>{used.toLocaleString("en-IN")} product{used === 1 ? " uses" : "s use"}</b> {list.length === 1 ? "this category" : "these categories"} .
              Tick to detach and delete — the products themselves stay.
            </span>
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
          <button type="button" autoFocus disabled={used > 0 && !detach} onClick={() => onConfirm(used > 0)}
            className="h-10 rounded-[0.375rem] bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
