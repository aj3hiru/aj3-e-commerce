"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  HardDrive, FileText, RotateCcw, Clock, Home, Store, Newspaper, LayoutDashboard, Layers,
  Loader2, CheckCircle2, AlertCircle, X, History, Database, Zap, ZapOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { CacheStats, CacheSection } from "@/lib/cache-manager2";

const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const SECTIONS: { key: CacheSection; label: string; blurb: string; icon: React.ComponentType<{ className?: string }>; tint: string }[] = [
  { key: "home", label: "Homepage", blurb: "The storefront landing page (/).", icon: Home, tint: "bg-blue-50 text-blue-600" },
  { key: "shop", label: "Storefront Pages", blurb: "Shop, categories, product pages, cart, checkout — everything under /shop.", icon: Store, tint: "bg-emerald-50 text-emerald-600" },
  { key: "blog", label: "Blog Posts", blurb: "Every published post, revalidated individually by its real URL.", icon: Newspaper, tint: "bg-amber-50 text-amber-600" },
  { key: "dashboard", label: "Admin Dashboard", blurb: "Your own dashboard stats view.", icon: LayoutDashboard, tint: "bg-violet-50 text-violet-600" },
];

export function CacheManager2Body({ stats: initial }: { stats: CacheStats }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [stats, setStats] = useState(initial);
  useEffect(() => setStats(initial), [initial]);
  const [busy, setBusy] = useState<CacheSection | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const notify = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 4000); };

  async function clear(section: CacheSection) {
    setBusy(section);
    const res = await fetch("/api/cache2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section }) })
      .then((r) => r.json()).catch(() => ({ success: false }));
    setBusy(null);
    if (res.success) {
      notify(true, `Cleared ${res.pathsCleared} item${res.pathsCleared === 1 ? "" : "s"}.`);
      router.refresh();
    } else notify(false, res.message ?? "Couldn't clear the cache.");
  }

  return (
    <div className={cn("mt-5 space-y-5", !loaded && "invisible")}>
      {show("cm2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {show("cm2-k-size") && <StatCard icon={HardDrive} tint="bg-blue-50 text-blue-600" value={formatBytes(stats.cacheSizeBytes)} label="Cache Size on Disk" />}
          {show("cm2-k-posts") && <StatCard icon={FileText} tint="bg-amber-50 text-amber-600" value={String(stats.publishedPostCount)} label="Trackable Blog Posts" />}
          {show("cm2-k-total") && <StatCard icon={RotateCcw} tint="bg-emerald-50 text-emerald-600" value={String(stats.totalClears)} label="Total Clears (all time)" />}
          {show("cm2-k-last") && <StatCard icon={Clock} tint="bg-violet-50 text-violet-600" value={stats.lastCleared ? relTime(stats.lastCleared.at) : "Never"} label={stats.lastCleared ? `Last: ${stats.lastCleared.section}` : "Last Cleared"} />}
        </div>
      )}

      {show("cm2-redis") && show("cm2-redis-panel") && (
        <div className={cn(CARD, "flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between")}>
          <div className="flex items-center gap-3">
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.5rem]", stats.redis.connected ? "bg-emerald-50 text-emerald-600" : "bg-admin-gray-100 text-admin-gray-400")}>
              <Database className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-admin-gray-900">Redis Cache</h3>
                {stats.redis.connected ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><Zap className="h-3 w-3" /> Connected</span>
                ) : stats.redis.configured ? (
                  <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600"><ZapOff className="h-3 w-3" /> Unreachable</span>
                ) : (
                  <span className="rounded-full bg-admin-gray-100 px-2 py-0.5 text-xs font-semibold text-admin-gray-500">Not configured</span>
                )}
              </div>
              <p className="text-sm text-admin-gray-500">
                {stats.redis.connected
                  ? `${stats.redis.keyCount ?? 0} key${stats.redis.keyCount === 1 ? "" : "s"} · ${stats.redis.memoryUsedBytes !== null ? formatBytes(stats.redis.memoryUsedBytes) : "—"} used`
                  : stats.redis.configured
                    ? (stats.redis.error ?? "Falling back to the database for every request — nothing is broken, just not cached.")
                    : "REDIS_URL isn't set, so caching is skipped and everything reads from the database directly — this is safe, just not faster."}
              </p>
            </div>
          </div>
          {stats.redis.connected && (
            <button type="button" disabled={busy !== null} onClick={() => clear("redis")}
              className="flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#dee2e6] bg-white px-4 text-sm font-semibold text-admin-gray-800 hover:bg-admin-gray-50 disabled:opacity-50">
              {busy === "redis" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Flush Redis Cache
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {show("cm2-sections") && show("cm2-sections-list") && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {SECTIONS.map((s) => {
                  const Icon = s.icon;
                  const isBusy = busy === s.key;
                  return (
                    <div key={s.key} className={cn(CARD, "flex flex-col gap-3 p-5")}>
                      <div className="flex items-start gap-3">
                        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.5rem]", s.tint)}><Icon className="h-5 w-5" /></span>
                        <div className="min-w-0">
                          <h3 className="font-bold text-admin-gray-900">{s.label}</h3>
                          <p className="text-sm text-admin-gray-500">{s.blurb}</p>
                        </div>
                      </div>
                      <button type="button" disabled={busy !== null} onClick={() => clear(s.key)}
                        className="mt-1 flex h-10 items-center justify-center gap-2 rounded-[0.5rem] border border-[#dee2e6] bg-white text-sm font-semibold text-admin-gray-800 hover:bg-admin-gray-50 disabled:opacity-50">
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Clear {s.label}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className={cn(CARD, "flex flex-col gap-3 border-[#2563eb]/30 bg-blue-50/30 p-5 sm:flex-row sm:items-center sm:justify-between")}>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.5rem] bg-[#2563eb]/10 text-[#2563eb]"><Layers className="h-5 w-5" /></span>
                  <div>
                    <h3 className="font-bold text-admin-gray-900">Everything</h3>
                    <p className="text-sm text-admin-gray-500">Homepage, storefront, all blog posts, the dashboard, and Redis — in one go.</p>
                  </div>
                </div>
                <button type="button" disabled={busy !== null} onClick={() => clear("all")}
                  className="flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-[#2563eb] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4ed8] disabled:opacity-50">
                  {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Clear Everything
                </button>
              </div>
            </>
          )}

          <p className="text-xs leading-relaxed text-admin-gray-400">
            This clears Next.js&apos;s page cache and Redis only — uploaded files, product data, and orders are never touched. Use it after changing homepage sections, publishing a post, or editing business settings, if the update doesn&apos;t appear right away.
          </p>
        </div>

        {show("cm2-history") && show("cm2-history-panel") && (
          <aside className={cn(CARD, "h-fit p-5")}>
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-admin-gray-900"><History className="h-4 w-4 text-admin-gray-400" /> Clear History</h3>
            {stats.history.length === 0 ? (
              <p className="py-6 text-center text-sm text-admin-gray-400">No cache clears logged yet.</p>
            ) : (
              <ul className="space-y-3">
                {stats.history.map((h) => (
                  <li key={h.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0">
                      <p className="text-admin-gray-800">{h.description}</p>
                      <p className="text-xs text-admin-gray-400">{h.by ? `By ${h.by} · ` : ""}{relTime(h.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
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

function StatCard({ icon: Icon, tint, value, label }: { icon: React.ComponentType<{ className?: string }>; tint: string; value: string; label: string }) {
  return (
    <div className={cn(CARD, "flex items-center gap-4 px-5 py-4")}>
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0"><span className="block truncate text-xl font-bold leading-tight text-admin-gray-900">{value}</span><span className="block truncate text-sm text-admin-gray-600">{label}</span></span>
    </div>
  );
}
