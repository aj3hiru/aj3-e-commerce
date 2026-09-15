"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Trash2, History } from "lucide-react";

export interface LogRow {
  id: number;
  username: string | null;
  role: string | null;
  actionType: string;
  description: string;
  ipAddress: string | null;
  createdAt: string;
}

interface ActivityLogsTableProps {
  logs: LogRow[];
  existingActions: string[];
  actionFilter: string;
  search: string;
  page: number;
  totalPages: number;
  totalLogs: number;
}

export function ActivityLogsTable({ logs, existingActions, actionFilter, search, page, totalPages, totalLogs }: ActivityLogsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(search);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  function applyFilters(next: Partial<{ search: string; action: string; page: number }>) {
    const params = new URLSearchParams(searchParams?.toString());
    if (next.search !== undefined) params.set("search", next.search);
    if (next.action !== undefined) params.set("action", next.action);
    params.set("page", String(next.page ?? 1));
    router.push(`?${params.toString()}`);
  }

  async function clearFiltered() {
    setBusy(true);
    try {
      const res = await fetch("/api/activity-logs/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionFilter, search }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(data.redirect);
        router.refresh();
      } else {
        alert(data.message);
      }
      setConfirmClear(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-admin-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters({ search: searchInput })}
              placeholder="Search description, IP, username…"
              className="pl-8 pr-3 py-2 text-sm border border-admin-gray-200 rounded w-64"
            />
          </div>
          <select value={actionFilter} onChange={(e) => applyFilters({ action: e.target.value })} className="border border-admin-gray-200 rounded px-3 py-2 text-sm">
            <option value="all">All Actions</option>
            {existingActions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="flex items-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white text-sm font-medium rounded px-3.5 py-2"
        >
          <Trash2 className="w-4 h-4" /> Clear Filtered ({totalLogs})
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white rounded-lg border border-admin-gray-200 py-16 text-center text-admin-gray-400">
          <History className="w-10 h-10 mx-auto mb-3" />
          <p>No activity logs match this filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-admin-gray-100">
                    <td className="py-2.5 px-4">
                      {l.username ?? <span className="text-admin-gray-400">Deleted user</span>}
                      {l.role && <div className="text-xs text-admin-gray-400 capitalize">{l.role}</div>}
                    </td>
                    <td className="py-2.5 px-4"><code className="bg-admin-gray-100 px-1.5 py-0.5 rounded text-xs">{l.actionType}</code></td>
                    <td className="py-2.5 px-4 max-w-[320px] truncate" title={l.description}>{l.description}</td>
                    <td className="py-2.5 px-4 text-admin-gray-500">{l.ipAddress ?? "—"}</td>
                    <td className="py-2.5 px-4">{new Date(l.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => applyFilters({ page: p })}
              className={`px-3 py-1.5 text-sm rounded ${p === page ? "bg-admin-primary text-white" : "bg-white border border-admin-gray-200"}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {confirmClear && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setConfirmClear(false)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold mb-2">Clear {totalLogs} Log{totalLogs === 1 ? "" : "s"}?</h5>
            <p className="text-sm text-admin-gray-600 mb-4">
              This deletes every log entry currently matching your filter/search. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmClear(false)} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">Cancel</button>
              <button type="button" onClick={clearFiltered} disabled={busy} className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                {busy ? "Clearing…" : "Clear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
