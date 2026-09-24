"use client";

import { useEffect, useState } from "react";
import { Download, Trash2, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { PushBrowser } from "@/lib/push-subscriptions";
import { BTN_OUTLINE, BTN_PRIMARY, CARD, ConfirmDialog, Pager, RowMenu, when } from "./ui";
import { ImportWizard } from "./ImportWizard";

export interface SubscriberRow { id: number; host: string; browser: PushBrowser; browserLabel: string; createdAt: string }
export interface SubscribersData {
  rows: SubscriberRow[]; total: number; page: number; pageCount: number; pageSize: number; newThisWeek: number;
  breakdown: { browser: PushBrowser; label: string; count: number }[];
}

const BROWSER_COLOR: Record<PushBrowser, string> = {
  chrome: "#2563eb", firefox: "#f97316", safari: "#0ea5e9", edge: "#14b8a6", other: "#94a3b8",
};

export const EVT_IMPORT = "push2:import";

export function exportSubscribers(format: "csv" | "json") {
  window.location.href = `/api/push2/subscribers/export?format=${format}`;
}

/** Subscribers: who can receive pushes, by browser — plus import/export and removal. */
export function SubscribersTab({ data, siteKey, onPage, onChanged, onError, onOpenSettings }: {
  data: SubscribersData; siteKey: { configured: boolean; fingerprint: string };
  onPage: (p: number) => void; onChanged: (text: string) => void; onError: (text: string) => void; onOpenSettings: () => void;
}) {
  const { isVisible: show } = useDashboardWidgetPrefs();
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<SubscriberRow | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const open = () => setImportOpen(true);
    window.addEventListener(EVT_IMPORT, open);
    return () => window.removeEventListener(EVT_IMPORT, open);
  }, []);

  async function remove(r: SubscriberRow) {
    setConfirm(null);
    setBusy(r.id);
    const res = await fetch(`/api/push2/subscribers/${r.id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => ({ success: false }));
    setBusy(null);
    if (res.success) onChanged("Subscriber removed.");
    else onError(res.error ?? "Couldn't remove this subscriber.");
  }

  const max = Math.max(1, ...data.breakdown.map((b) => b.count));
  const first = (data.page - 1) * data.pageSize + 1;

  return (
    <div className="space-y-5">
      {(show("pm2-s-breakdown") || show("pm2-s-tools")) && (
        <div className={cn("grid grid-cols-1 gap-5", show("pm2-s-breakdown") && show("pm2-s-tools") && "lg:grid-cols-[minmax(0,1fr)_340px]")}>
          {show("pm2-s-breakdown") && (
            <section className={cn(CARD, "p-5")}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-admin-gray-900">Subscribers by browser</h2>
                <span className="text-sm text-admin-gray-500"><b className="text-admin-gray-900">{formatInt(data.total)}</b> total · <b className="text-emerald-600">+{formatInt(data.newThisWeek)}</b> this week</span>
              </div>
              <div className="space-y-3">
                {data.breakdown.filter((b) => b.count > 0 || b.browser !== "other").map((b) => (
                  <div key={b.browser} className="grid grid-cols-[130px_minmax(0,1fr)_60px] items-center gap-3 text-sm">
                    <span className="truncate text-admin-gray-700">{b.label}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-admin-gray-100">
                      <span className="block h-full rounded-full" style={{ width: `${(b.count / max) * 100}%`, background: BROWSER_COLOR[b.browser] }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums text-admin-gray-900">{formatInt(b.count)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {show("pm2-s-tools") && (
            <section className={cn(CARD, "flex flex-col gap-3 p-5")}>
              <h2 className="text-base font-bold text-admin-gray-900">Import / Export</h2>
              <p className="text-xs text-admin-gray-500">Back up or move subscribers. Every row is verified before saving — works only with this site&apos;s <b>VAPID keys</b>.</p>
              <button type="button" onClick={() => setImportOpen(true)} className={BTN_PRIMARY}><Upload className="h-4 w-4" /> Import Subscribers</button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => exportSubscribers("csv")} disabled={data.total === 0} className={BTN_OUTLINE}><Download className="h-4 w-4" /> CSV</button>
                <button type="button" onClick={() => exportSubscribers("json")} disabled={data.total === 0} className={BTN_OUTLINE}><Download className="h-4 w-4" /> JSON</button>
              </div>
            </section>
          )}
        </div>
      )}

      {show("pm2-s-table") && (
        data.total === 0 ? (
          <div className={cn(CARD, "px-4 py-14 text-center text-admin-gray-500")}>
            <Users className="mx-auto mb-3 h-12 w-12 text-admin-gray-300" />
            <h3 className="mb-1 text-lg font-semibold text-admin-gray-800">No subscribers yet</h3>
            <p className="text-sm">Shoppers subscribe from the &quot;Allow Notifications&quot; prompt on your store — or import an existing list.</p>
          </div>
        ) : (
          <section className={cn(CARD, "overflow-hidden")}>
            <div className="flex items-center justify-between border-b border-admin-gray-100 px-5 py-3 text-sm text-admin-gray-600">
              <span className="font-semibold text-admin-gray-900">Subscriber list</span>
              <span>Showing {first} to {first + data.rows.length - 1} of {formatInt(data.total)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-admin-gray-50 text-xs font-semibold uppercase tracking-wide text-admin-gray-500">
                  <tr><th className="px-5 py-2.5">#</th><th className="px-5 py-2.5">Browser</th><th className="hidden px-5 py-2.5 sm:table-cell">Push service</th><th className="px-5 py-2.5">Subscribed</th><th className="px-5 py-2.5 text-right" /></tr>
                </thead>
                <tbody className="divide-y divide-admin-gray-100">
                  {data.rows.map((r) => (
                    <tr key={r.id} className={cn("hover:bg-admin-gray-50/60", busy === r.id && "opacity-50")}>
                      <td className="px-5 py-2.5 tabular-nums text-admin-gray-500">{r.id}</td>
                      <td className="px-5 py-2.5"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BROWSER_COLOR[r.browser] }} />{r.browserLabel}</span></td>
                      <td className="hidden px-5 py-2.5 font-mono text-xs text-admin-gray-500 sm:table-cell">{r.host}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs text-admin-gray-500">{when(r.createdAt)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <RowMenu label="Subscriber actions" disabled={busy === r.id} items={[{ label: "Remove", icon: Trash2, danger: true, onClick: () => setConfirm(r) }]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}

      {show("pm2-s-pager") && <Pager page={data.page} pageCount={data.pageCount} onPage={onPage} label="Subscriber pages" />}

      {importOpen && <ImportWizard siteKey={siteKey} onOpenSettings={() => { setImportOpen(false); onOpenSettings(); }}
        onClose={() => setImportOpen(false)} onDone={(text) => { setImportOpen(false); onChanged(text); }} />}
      {confirm && (
        <ConfirmDialog icon={<Trash2 className="h-6 w-6" />} tone="red" title="Remove subscriber?"
          text={<>{confirm.browserLabel} subscriber #{confirm.id} will stop receiving notifications. They can subscribe again from the store.</>}
          confirmLabel="Remove" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
      )}
    </div>
  );
}
