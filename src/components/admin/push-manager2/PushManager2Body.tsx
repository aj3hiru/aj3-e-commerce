"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Download, History, Megaphone, PenSquare, Percent, Plus, Settings, Upload,
  Users, X, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { ActionMenu } from "@/components/admin/ui/buttons";
import type { PushCatalog } from "@/lib/push-catalog";
import { CARD, StatCard } from "./ui";
import { ComposeTab, emptyDraft, type Draft } from "./ComposeTab";
import { HistoryTab, type HistoryData } from "./HistoryTab";
import { EVT_IMPORT, SubscribersTab, exportSubscribers, type SubscribersData } from "./SubscribersTab";
import { SettingsTab, type SettingsData } from "./SettingsTab";

export type PushTab = "compose" | "history" | "subscribers" | "settings";

const EVT_TAB = "push2:tab";

/** Header buttons (like coupons2): Export ▾, Import, New Push. They talk to the
 *  body through window events because AdminShell renders them in its top bar. */
export function PushManager2HeaderButtons({ canManage }: { canManage: boolean }) {
  const go = (tab: PushTab, then?: string) => window.dispatchEvent(new CustomEvent(EVT_TAB, { detail: { tab, then } }));
  return (
    <>
      {canManage && (
        <>
          <ActionMenu label="Export subscribers" bare align="right"
            triggerClassName="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#dee2e6] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]"
            trigger={<><Download className="h-4 w-4" /> Export</>}
            items={[
              { label: "Subscribers (CSV)", hint: "CSV", onClick: () => exportSubscribers("csv") },
              { label: "Subscribers (JSON)", hint: "JSON", onClick: () => exportSubscribers("json") },
            ]} />
          <button type="button" onClick={() => go("subscribers", EVT_IMPORT)}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#dee2e6] bg-white px-3.5 text-[0.875rem] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]">
            <Upload className="h-4 w-4" /> Import
          </button>
        </>
      )}
      <button type="button" onClick={() => go("compose")}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-[#2563eb] px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]">
        <Plus className="h-4 w-4" /> New Push
      </button>
    </>
  );
}

interface Props {
  tab: PushTab;
  canManageSettings: boolean;
  appName: string;
  siteUrl: string;
  catalog: PushCatalog;
  stats: { subscribers: number; campaigns: number; sent: number; failed: number };
  history: HistoryData;
  subscribers: SubscribersData | null;
  settings: SettingsData;
}

export function PushManager2Body({ tab, canManageSettings, appName, siteUrl, catalog, stats, history, subscribers, settings }: Props) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingEvent, setPendingEvent] = useState<string | null>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const go = (next: PushTab, page?: number) => {
    const qs = new URLSearchParams({ tab: next });
    if (page && page > 1) qs.set("page", String(page));
    router.push(`?${qs.toString()}`, { scroll: false });
  };

  // Header buttons → switch tab, then (once that tab is on screen) fire its action.
  useEffect(() => {
    const onTab = (e: Event) => {
      const { tab: next, then } = (e as CustomEvent<{ tab: PushTab; then?: string }>).detail;
      if (next !== tab) go(next);
      if (then) setPendingEvent(then);
    };
    window.addEventListener(EVT_TAB, onTab);
    return () => window.removeEventListener(EVT_TAB, onTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  useEffect(() => {
    if (!pendingEvent || (pendingEvent === EVT_IMPORT && tab !== "subscribers")) return;
    const t = setTimeout(() => { window.dispatchEvent(new Event(pendingEvent)); setPendingEvent(null); }, 50);
    return () => clearTimeout(t);
  }, [pendingEvent, tab]);

  const tabs: { value: PushTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "compose", label: "Compose", icon: PenSquare },
    { value: "history", label: "History", icon: History },
    ...(canManageSettings ? [
      { value: "subscribers" as const, label: "Subscribers", icon: Users },
      { value: "settings" as const, label: "Settings", icon: Settings },
    ] : []),
  ];

  const attempted = stats.sent + stats.failed;
  const rate = attempted > 0 ? Math.round((stats.sent / attempted) * 100) : 0;
  const cards = [
    { key: "pm2-k-subs", el: <StatCard icon={Users} tint="bg-blue-50 text-[#2563eb]" value={stats.subscribers} label="Subscribers" /> },
    { key: "pm2-k-campaigns", el: <StatCard icon={Megaphone} tint="bg-violet-50 text-violet-600" value={stats.campaigns} label="Campaigns" /> },
    { key: "pm2-k-sent", el: <StatCard icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" value={stats.sent} label="Delivered" /> },
    { key: "pm2-k-failed", el: <StatCard icon={XCircle} tint="bg-red-50 text-red-500" value={stats.failed} label="Failed" /> },
    { key: "pm2-k-rate", el: <StatCard icon={Percent} tint="bg-amber-50 text-amber-600" value={rate} suffix="%" label="Delivery Rate" /> },
  ].filter((c) => show(c.key));

  return (
    <div className={cn("mt-5 space-y-5", !loaded && "invisible")}>
      {show("pm2-cards") && cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {cards.map((c) => <div key={c.key}>{c.el}</div>)}
        </div>
      )}

      {show("pm2-notice") && !settings.configured && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[0.375rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Push notifications aren&apos;t configured yet — sending is disabled until the VAPID keys are saved.</span>
          {canManageSettings && tab !== "settings" && (
            <button type="button" onClick={() => go("settings")} className="font-semibold text-amber-900 underline-offset-2 hover:underline">Open Settings</button>
          )}
        </div>
      )}

      <div className={cn(CARD, "p-3.5")}>
        <div role="tablist" className="grid w-full grid-cols-2 gap-1 rounded-[0.5rem] border border-[#dee2e6] p-1 sm:inline-flex sm:w-auto sm:items-center">
          {tabs.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => go(t.value)}
              className={cn("flex h-9 items-center justify-center gap-1.5 rounded-[0.375rem] px-2 text-sm font-medium transition-colors sm:px-3",
                tab === t.value ? "bg-[#2563eb] text-white" : "text-admin-gray-700 hover:bg-admin-gray-50")}>
              <t.icon className="h-4 w-4 shrink-0" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "compose" && show("pm2-compose") && (
        <ComposeTab draft={draft} setDraft={setDraft} catalog={catalog} appName={appName} siteUrl={siteUrl}
          configured={settings.configured} subscribers={stats.subscribers}
          onSent={() => { setDraft(emptyDraft()); router.refresh(); }}
          onViewProgress={() => go("history")} />
      )}
      {tab === "history" && show("pm2-history") && (
        <HistoryTab history={history} onPage={(p) => go("history", p)} onCompose={() => go("compose")}
          onReuse={(c) => {
            setDraft({
              kind: "custom", target: { type: "reuse", label: c.title, image: c.image ?? "" },
              url: stripUtm(c.url ?? ""), title: c.title, body: c.body, image: c.image ?? "", utm: true,
            });
            go("compose");
          }}
          onDeleted={(title) => { setToast({ ok: true, text: `"${title}" deleted.` }); router.refresh(); }}
          onError={(text) => setToast({ ok: false, text })} />
      )}
      {tab === "subscribers" && canManageSettings && subscribers && show("pm2-subs") && (
        <SubscribersTab data={subscribers} onPage={(p) => go("subscribers", p)}
          onChanged={(text) => { setToast({ ok: true, text }); router.refresh(); }}
          onError={(text) => setToast({ ok: false, text })} />
      )}
      {tab === "settings" && canManageSettings && show("pm2-settings") && (
        <SettingsTab settings={settings} subscribers={stats.subscribers}
          onSaved={() => { setToast({ ok: true, text: "Push settings saved." }); router.refresh(); }}
          onError={(text) => setToast({ ok: false, text })} />
      )}

      {toast && createPortal(
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2200] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg",
          toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>, document.body
      )}
    </div>
  );
}

/** "Use again" starts from the original link; UTM tags are re-added on send if enabled. */
function stripUtm(url: string): string {
  try {
    const u = new URL(url);
    ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return url;
  }
}
