"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BellOff, Link2, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { CampaignHistoryRow } from "@/lib/push-manager2";
import { CARD, ConfirmDialog, Pager, RowMenu, Thumb, when } from "./ui";

export interface HistoryData { rows: CampaignHistoryRow[]; total: number; page: number; pageCount: number; pageSize: number }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-[#fff3cd] text-[#856404]" },
  processing: { label: "Processing", cls: "bg-[#cfe2ff] text-[#084298]" },
  sending: { label: "Processing", cls: "bg-[#cfe2ff] text-[#084298]" }, // older campaigns
  completed: { label: "Completed", cls: "bg-[#d1e7dd] text-[#0f5132]" },
  sent: { label: "Completed", cls: "bg-[#d1e7dd] text-[#0f5132]" }, // older campaigns
  failed: { label: "Failed", cls: "bg-[#f8d7da] text-[#842029]" },
  draft: { label: "Draft", cls: "bg-admin-gray-100 text-admin-gray-600" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), cls: "bg-admin-gray-100 text-admin-gray-600" };
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", meta.cls)}>{meta.label}</span>;
}

function Progress({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded bg-[#e9ecef]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-[#2563eb] transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

const progressOf = (c: CampaignHistoryRow) => (c.totalSubscribers > 0 ? Math.min(100, Math.round((c.sent / c.totalSubscribers) * 1000) / 10) : 0);
export const isLive = (s: string) => s === "pending" || s === "processing" || s === "sending";

/** view-logs.php: campaigns with status, progress, sent/failed, pagination and delete. */
export function HistoryTab({ history, onPage, onCompose, onReuse, onDeleted, onError }: {
  history: HistoryData; onPage: (p: number) => void; onCompose: () => void;
  onReuse: (c: CampaignHistoryRow) => void; onDeleted: (title: string) => void; onError: (text: string) => void;
}) {
  const router = useRouter();
  const { isVisible: show } = useDashboardWidgetPrefs();
  const [confirm, setConfirm] = useState<CampaignHistoryRow | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const live = history.rows.some((c) => isLive(c.status));

  // view-logs.php refreshed every 30s; while a campaign is sending, refresh faster.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), live ? 5_000 : 30_000);
    return () => clearInterval(t);
  }, [router, live]);

  async function remove(c: CampaignHistoryRow) {
    setConfirm(null);
    setBusy(c.id);
    const res = await fetch(`/api/push2/campaigns/${c.id}`, { method: "DELETE" }).then((r) => r.json()).catch(() => ({ success: false }));
    setBusy(null);
    if (res.success) onDeleted(c.title || "Custom Push");
    else onError(res.error ?? "Couldn't delete this campaign.");
  }

  const actions = (c: CampaignHistoryRow) => (
    <RowMenu label="Campaign actions" disabled={busy === c.id} items={[
      { label: "Use again", icon: RotateCcw, onClick: () => onReuse(c) },
      ...(c.url ? [{ label: "View URL", icon: Link2, onClick: () => window.open(c.url!, "_blank", "noopener,noreferrer") }] : []),
      { label: "Delete", icon: Trash2, danger: true, onClick: () => setConfirm(c) },
    ]} />
  );

  if (history.total === 0) {
    return (
      <div className={cn(CARD, "px-4 py-16 text-center text-admin-gray-500")}>
        <BellOff className="mx-auto mb-3 h-12 w-12 text-admin-gray-300" />
        <h3 className="mb-1 text-lg font-semibold text-admin-gray-800">No campaigns yet</h3>
        <p className="mb-5 text-sm">Start sending notifications from the manager</p>
        <button type="button" onClick={onCompose} className="h-10 rounded-[0.375rem] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8]">Create First Push</button>
      </div>
    );
  }

  const first = (history.page - 1) * history.pageSize + 1;
  const col = {
    image: show("pm2-h-image"), status: show("pm2-h-status"), progress: show("pm2-h-progress"), counts: show("pm2-h-counts"),
    total: show("pm2-h-total"), time: show("pm2-h-time"), actions: show("pm2-h-actions"),
  };

  return (
    <section className="space-y-4">
      {show("pm2-h-live") && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-admin-gray-600">
          <span className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-admin-gray-300")} />
            {live ? "Sending in progress • refreshing every 5s" : "Live status • auto-refresh every 30s"}
          </span>
          <span>Showing {first} to {first + history.rows.length - 1} of {formatInt(history.total)} campaigns</span>
        </div>
      )}

      {/* Desktop + tablet: table */}
      <div className={cn(CARD, "hidden overflow-x-auto md:block")}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-admin-gray-200 bg-admin-gray-50 text-xs font-semibold uppercase tracking-wide text-admin-gray-500">
            <tr>
              <th className="px-4 py-3">Campaign / Post</th>
              {col.status && <th className="px-4 py-3">Status</th>}
              {col.progress && <th className="px-4 py-3">Progress</th>}
              {col.counts && <th className="px-4 py-3">Sent / Failed</th>}
              {col.total && <th className="px-4 py-3">Total</th>}
              {col.time && <th className="px-4 py-3">Time</th>}
              {col.actions && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-gray-100">
            {history.rows.map((c) => {
              const pct = progressOf(c);
              return (
                <tr key={c.id} className={cn("align-middle hover:bg-admin-gray-50/60", busy === c.id && "opacity-50")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {col.image && <Thumb src={c.image ?? ""} className="h-[60px] w-[60px]" />}
                      <div className="min-w-0">
                        <div className="max-w-[320px] truncate text-[15px] font-semibold text-admin-gray-900">{c.title || "Custom Push"}</div>
                        {c.post ? <div className="max-w-[320px] truncate text-xs text-[#2563eb]">{c.post.title}</div>
                          : c.url && <div className="max-w-[320px] truncate text-xs text-admin-gray-400">{c.url.replace(/^https?:\/\//, "").split("?")[0]}</div>}
                      </div>
                    </div>
                  </td>
                  {col.status && <td className="px-4 py-3"><StatusBadge status={c.status} /></td>}
                  {col.progress && <td className="w-[160px] px-4 py-3"><Progress pct={pct} /><span className="text-xs text-admin-gray-500">{pct}%</span></td>}
                  {col.counts && <td className="whitespace-nowrap px-4 py-3"><b className="text-emerald-600">{formatInt(c.sent)}</b><span className="ml-2 text-xs text-red-500">/ {formatInt(c.failed)}</span></td>}
                  {col.total && <td className="px-4 py-3">{formatInt(c.totalSubscribers)}</td>}
                  {col.time && <td className="whitespace-nowrap px-4 py-3 text-xs text-admin-gray-500">{when(c.createdAt)}</td>}
                  {col.actions && <td className="px-4 py-3 text-right">{actions(c)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {history.rows.map((c) => {
          const pct = progressOf(c);
          return (
            <div key={c.id} className={cn(CARD, "p-4", busy === c.id && "opacity-50")}>
              <div className="mb-3 flex gap-3">
                {col.image && <Thumb src={c.image ?? ""} className="h-[50px] w-[50px]" />}
                <div className="min-w-0 flex-1">
                  <div className="break-words font-semibold text-admin-gray-900">{c.title || "Custom Push"}</div>
                  {c.post && <div className="truncate text-xs text-[#2563eb]">{c.post.title}</div>}
                </div>
                {col.actions && actions(c)}
              </div>
              {(col.status || col.time) && (
                <div className="mb-2 flex items-center justify-between gap-2">
                  {col.status ? <StatusBadge status={c.status} /> : <span />}
                  {col.time && <span className="text-xs text-admin-gray-500">{when(c.createdAt)}</span>}
                </div>
              )}
              {col.progress && <Progress pct={pct} />}
              {(col.counts || col.total) && (
                <div className="mt-2 flex justify-between text-xs">
                  {col.counts && <><span><b className="text-emerald-600">{formatInt(c.sent)}</b> sent</span><span><b className="text-red-500">{formatInt(c.failed)}</b> failed</span></>}
                  {col.total && <span>{formatInt(c.totalSubscribers)} total</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {show("pm2-h-pager") && <Pager page={history.page} pageCount={history.pageCount} onPage={onPage} label="Campaign pages" />}

      {confirm && (
        <ConfirmDialog icon={<AlertTriangle className="h-6 w-6" />} tone="red" title="Delete Campaign?"
          text={<>Are you sure you want to delete &quot;{confirm.title || "Custom Push"}&quot;? This action cannot be undone.{isLive(confirm.status) && <> It is still sending — any notifications not yet delivered will be cancelled.</>}</>}
          confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
      )}
    </section>
  );
}
