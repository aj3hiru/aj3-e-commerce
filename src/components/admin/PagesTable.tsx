"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, FilePen, FileCheck2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconAction, StatusBadge } from "./ui/buttons";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";

export interface PageRow {
  id: number;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
}

const CARD = "rounded-[10px] border border-admin-gray-200 bg-white shadow-sm";
const th = "border-b border-[#e6e8ef] px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.05em] text-admin-gray-500";
const td = "border-b border-[#eef0f4] px-4 py-3 align-middle";

/** Static pages (About Us, Privacy Policy…): numbers, search, status tabs and the list. */
export function PagesTable({ pages }: { pages: PageRow[] }) {
  const router = useRouter();
  const { isVisible, loaded } = useDashboardWidgetPrefs();
  const on = (g: string, k: string) => isVisible(g) && isVisible(k);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "published" | "draft">("all");

  const counts = { all: pages.length, published: pages.filter((p) => p.status === "published").length, draft: pages.filter((p) => p.status !== "published").length };
  const list = useMemo(() => pages.filter((p) => (tab === "all" || (tab === "published" ? p.status === "published" : p.status !== "published"))
    && (!q.trim() || `${p.title} ${p.slug}`.toLowerCase().includes(q.trim().toLowerCase()))), [pages, tab, q]);

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

  const stats = [
    { key: "pg-k-total", icon: FileText, tone: "bg-blue-50 text-blue-600", value: counts.all, label: "All pages" },
    { key: "pg-k-published", icon: FileCheck2, tone: "bg-emerald-50 text-emerald-600", value: counts.published, label: "Published" },
    { key: "pg-k-draft", icon: FilePen, tone: "bg-amber-50 text-amber-600", value: counts.draft, label: "Drafts" },
  ].filter((s) => on("pg-stats", s.key));

  return (
    <div className={cn("space-y-4", !loaded && "invisible")}>
      {stats.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.key} className={cn(CARD, "flex items-center gap-3 px-4 py-3")}>
              <span className={cn("grid h-9 w-9 place-items-center rounded-[8px]", s.tone)}><s.icon className="h-[18px] w-[18px]" /></span>
              <span><span className="block text-lg font-bold leading-tight text-admin-gray-900">{s.value}</span><span className="text-xs text-admin-gray-500">{s.label}</span></span>
            </div>
          ))}
        </div>
      )}

      {isVisible("pg-table") && (
        <section className={cn(CARD, "p-4")}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {on("pg-table", "pg-t-tabs") && (
              <div className="flex rounded-[8px] bg-admin-gray-100 p-1 text-sm">
                {(["all", "published", "draft"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                    className={cn("h-8 rounded-[6px] px-3 font-medium capitalize", tab === t ? "bg-white text-[#2563eb] shadow-sm" : "text-admin-gray-600")}>
                    {t === "all" ? "All" : t === "draft" ? "Drafts" : "Published"} <span className="text-xs text-admin-gray-400">{counts[t]}</span>
                  </button>
                ))}
              </div>
            )}
            {on("pg-table", "pg-t-search") && (
              <span className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages…" aria-label="Search pages"
                  className="h-9 w-full rounded-[8px] border border-admin-gray-200 pl-8 pr-3 text-sm focus:border-[#2563eb] focus:outline-none" />
              </span>
            )}
            <Link href="/admin/pages/new" className="ml-auto flex h-9 items-center gap-1.5 rounded-[8px] bg-[#2563eb] px-3.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]"><Plus className="h-4 w-4" />Add page</Link>
          </div>

          {pages.length === 0 ? (
            <p className="py-14 text-center text-sm text-admin-gray-400">No pages yet — create your first one (About Us, Terms, Privacy Policy…).</p>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-[#eef0f4]">
              <table className="w-full text-sm">
                <thead className="bg-[#f8f9fb]">
                  <tr>
                    {on("pg-table", "pg-c-title") && <th className={th}>Title</th>}
                    {on("pg-table", "pg-c-slug") && <th className={th}>Link</th>}
                    {on("pg-table", "pg-c-status") && <th className={th}>Status</th>}
                    {on("pg-table", "pg-c-updated") && <th className={th}>Updated</th>}
                    {on("pg-table", "pg-c-actions") && <th className={th}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-admin-gray-400">No pages match.</td></tr>}
                  {list.map((p) => (
                    <tr key={p.id} className="hover:bg-[#f8f9fe]">
                      {on("pg-table", "pg-c-title") && <td className={cn(td, "font-medium text-admin-gray-900")}><Link href={`/admin/pages/${p.id}`} className="hover:text-[#2563eb] hover:underline">{p.title}</Link></td>}
                      {on("pg-table", "pg-c-slug") && <td className={cn(td, "text-admin-gray-500")}>/{p.slug}</td>}
                      {on("pg-table", "pg-c-status") && <td className={td}><StatusBadge variant={p.status === "published" ? "success" : "secondary"}>{p.status === "published" ? "Published" : "Draft"}</StatusBadge></td>}
                      {on("pg-table", "pg-c-updated") && <td className={cn(td, "text-admin-gray-600")}>{new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>}
                      {on("pg-table", "pg-c-actions") && (
                        <td className={td}>
                          <div className="flex items-center gap-1.5">
                            {p.status === "published" && <IconAction tone="view" href={`/${p.slug}`} target="_blank" rel="noreferrer" title="View page"><ExternalLink /></IconAction>}
                            <IconAction tone="edit" href={`/admin/pages/${p.id}`} title="Edit"><Pencil /></IconAction>
                            <IconAction tone="delete" title="Delete" onClick={() => setDeleteTarget({ id: p.id, title: p.title })}><Trash2 /></IconAction>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-[10px] bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="mb-2 font-bold">Delete this page?</h5>
            <p className="mb-4 text-sm text-admin-gray-600">&quot;<strong>{deleteTarget.title}</strong>&quot; will be removed from the store.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="h-9 rounded-[8px] bg-admin-gray-100 px-4 text-sm hover:bg-admin-gray-200">Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={busy} className="h-9 rounded-[8px] bg-red-600 px-4 text-sm text-white hover:bg-red-700 disabled:opacity-60">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
