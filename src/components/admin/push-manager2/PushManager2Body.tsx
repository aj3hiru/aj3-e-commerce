"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bell, BellOff, Send, Search, History, Settings, Smartphone, Link2, Trash2, MoreVertical, Loader2, CheckCircle2,
  AlertCircle, AlertTriangle, X, Users, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown,
  KeyRound, Eye, EyeOff, PenSquare, RotateCcw, XCircle, Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";
import type { CampaignHistoryRow } from "@/lib/push-manager2";

export type PushTab = "compose" | "history" | "settings";

interface Props {
  tab: PushTab;
  canManageSettings: boolean;
  appName: string;
  siteUrl: string;
  stats: { subscribers: number; campaigns: number; sent: number; failed: number };
  history: { rows: CampaignHistoryRow[]; total: number; page: number; pageCount: number; pageSize: number };
  settings: { configured: boolean; publicKey: string; subject: string; hasPrivateKey: boolean };
}

interface Draft {
  postId: number | null;
  postTitle: string;
  postImage: string;
  url: string;
  title: string;
  body: string;
  image: string;
}

const EMPTY_DRAFT: Draft = { postId: null, postTitle: "", postImage: "", url: "", title: "", body: "", image: "" };
// admin_push.php pre-filled this body when a post was picked; kept as the default, editable.
const DEFAULT_POST_BODY = "New government job alert! Check it out.";

const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";
const INPUT =
  "h-10 w-full rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15";
const LABEL = "mb-1 block text-xs font-semibold text-admin-gray-600";
const SECTION_LABEL = "mb-3 block text-xs font-bold uppercase tracking-wide text-admin-gray-500";

/** Turns a stored relative path ("uploads/x.jpg") into an absolute URL — push
 *  services fetch the image from the subscriber's device, so it must be absolute. */
function absoluteUrl(path: string, origin: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function PushManager2Body({ tab, canManageSettings, appName, siteUrl, stats, history, settings }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const go = (next: PushTab, page?: number) => {
    const qs = new URLSearchParams({ tab: next });
    if (page && page > 1) qs.set("page", String(page));
    router.push(`?${qs.toString()}`, { scroll: false });
  };

  const tabs: { value: PushTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "compose", label: "Compose", icon: PenSquare },
    { value: "history", label: "History", icon: History },
    ...(canManageSettings ? [{ value: "settings" as const, label: "Settings", icon: Settings }] : []),
  ];

  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Users} tint="bg-blue-50 text-[#2563eb]" value={stats.subscribers} label="Subscribers" />
        <StatCard icon={Megaphone} tint="bg-violet-50 text-violet-600" value={stats.campaigns} label="Campaigns" />
        <StatCard icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" value={stats.sent} label="Delivered" />
        <StatCard icon={XCircle} tint="bg-red-50 text-red-500" value={stats.failed} label="Failed" />
      </div>

      {!settings.configured && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[0.375rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Push notifications aren&apos;t configured yet — sending is disabled until the VAPID keys are saved.</span>
          {canManageSettings && tab !== "settings" && (
            <button type="button" onClick={() => go("settings")} className="font-semibold text-amber-900 underline-offset-2 hover:underline">Open Settings</button>
          )}
        </div>
      )}

      <div className={cn(CARD, "flex flex-wrap items-center gap-3 p-3.5")}>
        <div role="tablist" className={cn("grid w-full gap-1 rounded-[0.5rem] border border-[#dee2e6] p-1 sm:flex sm:w-auto sm:items-center", tabs.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {tabs.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => go(t.value)}
              className={cn("flex h-9 items-center justify-center gap-1.5 rounded-[0.375rem] px-2 text-sm font-medium transition-colors sm:px-3",
                tab === t.value ? "bg-[#2563eb] text-white" : "text-admin-gray-700 hover:bg-admin-gray-50")}>
              <t.icon className="h-4 w-4 shrink-0" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "compose" && (
        <ComposeTab draft={draft} setDraft={setDraft} appName={appName} siteUrl={siteUrl}
          configured={settings.configured} subscribers={stats.subscribers}
          onSent={() => { setDraft(EMPTY_DRAFT); router.refresh(); }}
          onViewProgress={() => go("history")} />
      )}
      {tab === "history" && (
        <HistoryTab history={history} onPage={(p) => go("history", p)} onCompose={() => go("compose")}
          onReuse={(c) => {
            setDraft({ postId: null, postTitle: c.post?.title ?? "", postImage: c.image ?? "", url: c.url ?? "", title: c.title, body: c.body, image: c.image ?? "" });
            go("compose");
          }}
          onDeleted={(title) => { setToast({ ok: true, text: `"${title}" deleted.` }); router.refresh(); }}
          onError={(text) => setToast({ ok: false, text })} />
      )}
      {tab === "settings" && canManageSettings && (
        <SettingsTab settings={settings} subscribers={stats.subscribers}
          onSaved={() => { setToast({ ok: true, text: "Push settings saved." }); router.refresh(); }}
          onError={(text) => setToast({ ok: false, text })} />
      )}

      {toast && createPortal(
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg",
          toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>, document.body
      )}
    </div>
  );
}

/* ───────────────────────── Compose (admin_push.php) ───────────────────────── */

function ComposeTab({ draft, setDraft, appName, siteUrl, configured, subscribers, onSent, onViewProgress }: {
  draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; appName: string; siteUrl: string;
  configured: boolean; subscribers: number;
  onSent: () => void; onViewProgress: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const canSend = configured && draft.title.trim() !== "" && draft.url.trim() !== "" && !sending;

  function pickPost(p: { id: number; title: string; slug: string; image: string | null }) {
    const origin = siteUrl || window.location.origin;
    const image = p.image ? absoluteUrl(p.image, origin) : "";
    setDraft({
      postId: p.id, postTitle: p.title, postImage: image,
      url: absoluteUrl(p.slug, origin), title: p.title, body: DEFAULT_POST_BODY, image,
    });
    setPickerOpen(false);
  }

  async function send() {
    setConfirmOpen(false);
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/push2/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, body: draft.body, url: draft.url, image: draft.image || null, postId: draft.postId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        const n = Number(data.totalSubscribers ?? 0);
        const text = `Background process started — sending to ${formatInt(n)} subscriber${n === 1 ? "" : "s"}.`;
        setResult({ ok: true, text });
        onSent();
      } else {
        setResult({ ok: false, text: data.error ?? "Could not send the notification." });
      }
    } catch (e) {
      setResult({ ok: false, text: `Network error: ${e instanceof Error ? e.message : "request failed"}` });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <section className={CARD}>
        <header className="flex items-center gap-2 border-b border-admin-gray-100 px-5 py-4">
          <PenSquare className="h-4 w-4 text-[#2563eb]" />
          <h2 className="text-base font-bold text-[#2563eb]">Compose Notification</h2>
        </header>
        <div className="space-y-6 p-5">
          <div>
            <span className={SECTION_LABEL}>1. Select Post</span>
            <button type="button" onClick={() => setPickerOpen(true)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[0.375rem] bg-[#2563eb] text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8]">
              <Search className="h-4 w-4" /> Search &amp; Select Post
            </button>
            {draft.postTitle && (
              <div className="mt-3 flex items-center gap-4 rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50 p-2.5">
                <Thumb src={draft.postImage} className="h-[60px] w-[60px]" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-admin-gray-500">{draft.postId ? "Linked Post" : "Reusing campaign"}</div>
                  <div className="truncate text-sm font-bold leading-tight text-admin-gray-900">{draft.postTitle}</div>
                </div>
                <button type="button" onClick={() => set({ postId: null, postTitle: "", postImage: "" })} aria-label="Unlink post"
                  className="rounded p-1 text-admin-gray-400 hover:bg-admin-gray-100 hover:text-admin-gray-700"><X className="h-4 w-4" /></button>
              </div>
            )}
          </div>

          <hr className="border-admin-gray-100" />

          <div className="space-y-3.5">
            <span className={SECTION_LABEL}>2. Notification Details</span>
            <div>
              <label htmlFor="push-url" className={LABEL}>Target URL <span className="text-red-500">*</span></label>
              <input id="push-url" type="url" value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://example.com/my-page" className={INPUT} />
            </div>
            <div>
              <label htmlFor="push-title" className={LABEL}>Title <span className="text-red-500">*</span></label>
              <input id="push-title" type="text" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Notification Title" maxLength={120} className={INPUT} />
            </div>
            <div>
              <label htmlFor="push-body" className={LABEL}>Message Body</label>
              <textarea id="push-body" rows={2} value={draft.body} onChange={(e) => set({ body: e.target.value })} placeholder="Short description..." maxLength={300}
                className={cn(INPUT, "h-auto py-2")} />
            </div>
            <div>
              <label htmlFor="push-image" className={LABEL}>Banner Image URL</label>
              <input id="push-image" type="text" value={draft.image} onChange={(e) => set({ image: e.target.value })} placeholder="https://..." className={INPUT} />
            </div>
          </div>

          <div className="space-y-2">
            <button type="button" disabled={!canSend} onClick={() => setConfirmOpen(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[0.375rem] bg-[#16a34a] text-[15px] font-bold text-white transition-colors hover:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-50">
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send to All Subscribers</>}
            </button>
            <button type="button" onClick={onViewProgress}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[0.375rem] border border-[#0dcaf0] text-sm font-medium text-[#0aa2c0] transition-colors hover:bg-[#0dcaf0]/10">
              <History className="h-4 w-4" /> View Live Progress
            </button>
            {!configured && <p className="text-xs text-amber-700">Sending is disabled until VAPID keys are saved in Settings.</p>}
          </div>

          {result && (
            <div role="alert" className={cn("flex items-start gap-2 rounded-[0.375rem] border px-3 py-2.5 text-sm",
              result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>
              {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span className="flex-1"><b>{result.ok ? "Success:" : "Error:"}</b> {result.text}</span>
              <button type="button" onClick={() => setResult(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </section>

      <aside className="flex flex-col items-center lg:sticky lg:top-5 lg:self-start">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-admin-gray-500">
          <Smartphone className="h-3.5 w-3.5" /> Live Lock Screen Preview
        </h3>
        <PhonePreview appName={appName} title={draft.title} body={draft.body} image={draft.image} />
        <p className="mt-3 max-w-[300px] px-4 text-center text-[11px] text-admin-gray-500">
          *Preview renders roughly how it appears on modern Android devices.
        </p>
      </aside>

      {pickerOpen && <PostPicker onClose={() => setPickerOpen(false)} onPick={pickPost} siteUrl={siteUrl} />}
      {confirmOpen && (
        <ConfirmDialog
          icon={<Send className="h-6 w-6" />} tone="blue"
          title="Send this notification?"
          text={<>&quot;{draft.title}&quot; will be sent to <b>{formatInt(subscribers)}</b> subscriber{subscribers === 1 ? "" : "s"}. This can&apos;t be undone.</>}
          confirmLabel="Send Now" onCancel={() => setConfirmOpen(false)} onConfirm={send} />
      )}
    </div>
  );
}

/** The smartphone lock-screen mockup from admin_push.php: notch, clock/date,
 *  and an Android-style notification card that updates as you type. */
function PhonePreview({ appName, title, body, image }: { appName: string; title: string; body: string; image: string }) {
  // The clock is the viewer's local time, so it's only filled in after mount
  // (the server's clock/timezone would mismatch the browser's on hydration).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => setImgOk(true), [image]);

  const time = now ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const date = now ? now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "";

  return (
    <div className="relative h-[600px] w-[300px] shrink-0 overflow-hidden rounded-[40px] border-4 border-[#444] bg-[#111] shadow-[0_0_0_10px_#333,0_20px_50px_rgba(0,0,0,0.2)]">
      <div className="absolute left-1/2 top-0 z-[5] h-[25px] w-[120px] -translate-x-1/2 rounded-b-[15px] bg-[#111]" />
      <div className="relative h-full w-full bg-[linear-gradient(135deg,#667eea_0%,#764ba2_100%)] pt-[60px]" style={{ fontFamily: "Roboto, system-ui, sans-serif" }}>
        <div className="mb-5 h-[62px] text-center text-[52px] font-light leading-none text-white/80" suppressHydrationWarning>{time}</div>
        <div className="-mt-2.5 mb-[30px] h-5 text-center text-sm text-white/80" suppressHydrationWarning>{date}</div>

        <div key={`${title}|${image}`} className="mx-[15px] overflow-hidden rounded-xl bg-white/95 shadow-[0_4px_15px_rgba(0,0,0,0.1)] animate-[pm2-slide-in_0.3s_ease-out]">
          <div className="flex items-center justify-between px-3 pb-1 pt-2.5 text-[11px] text-[#555]">
            <div className="flex min-w-0 items-center gap-[5px]">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#2563eb] text-white"><Bell className="h-2.5 w-2.5" /></span>
              <span className="truncate font-bold">{appName}</span>
            </div>
            <span className="flex shrink-0 items-center">now <ChevronDown className="ml-1 h-3 w-3" /></span>
          </div>
          <div className="px-3 pb-3 pt-1">
            <div className="mb-0.5 break-words text-sm font-bold leading-tight text-[#222]">{title || "Notification Title"}</div>
            <div className="mb-2 break-words text-xs leading-snug text-[#444]">{body || "Notification body text..."}</div>
            {image && imgOk && (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL typed by the admin
              <img src={image} alt="" onError={() => setImgOk(false)} className="mt-1 block h-[120px] w-full rounded-lg object-cover" />
            )}
          </div>
        </div>
      </div>
      <style>{"@keyframes pm2-slide-in{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}"}</style>
    </div>
  );
}

type PostHit = { id: number; title: string; slug: string; image: string | null };

/** The "Search & Select Post" modal: loads the newest published posts on open,
 *  then searches by title on Enter / the Search button (like admin_push.php). */
function PostPicker({ onClose, onPick, siteUrl }: { onClose: () => void; onPick: (p: PostHit) => void; siteUrl: string }) {
  const [q, setQ] = useState("");
  const [posts, setPosts] = useState<PostHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  async function search(term: string) {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/push2/posts?q=${encodeURIComponent(term.trim())}`);
      const data = await res.json().catch(() => ({}));
      if (id !== reqId.current) return; // a newer search already started
      if (data.success) setPosts(data.posts ?? []);
      else { setPosts([]); setError(data.error ?? "Couldn't load posts."); }
    } catch {
      if (id === reqId.current) { setPosts([]); setError("Couldn't load posts."); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  useEffect(() => {
    search("");
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const origin = siteUrl || (typeof window !== "undefined" ? window.location.origin : "");

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Select a post" className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 pb-2">
          <form className="flex flex-1" onSubmit={(e) => { e.preventDefault(); search(q); }}>
            <input ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type title to search..." autoComplete="off"
              className={cn(INPUT, "rounded-r-none")} />
            <button type="submit" className="flex h-10 shrink-0 items-center gap-1.5 rounded-r-[0.375rem] border border-l-0 border-[#2563eb] px-3 text-sm font-medium text-[#2563eb] hover:bg-blue-50">
              <Search className="h-4 w-4" /> Search
            </button>
          </form>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-admin-gray-500 hover:bg-admin-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-[160px] flex-1 overflow-y-auto px-2 pb-3">
          {loading && <div className="flex justify-center py-8 text-[#2563eb]"><Loader2 className="h-7 w-7 animate-spin" /></div>}
          {!loading && error && <div className="px-3 py-8 text-center text-sm text-red-600">{error}</div>}
          {!loading && !error && posts?.length === 0 && (
            <div className="py-8 text-center text-sm text-admin-gray-500"><Search className="mx-auto mb-2 h-6 w-6 opacity-50" />No posts found</div>
          )}
          {!loading && !error && posts && posts.length > 0 && (
            <ul>
              {posts.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPick(p)}
                    className="flex w-full items-center gap-3 border-b border-l-4 border-b-admin-gray-100 border-l-transparent px-3 py-3 text-left transition-colors hover:border-l-[#2563eb] hover:bg-admin-gray-50">
                    <Thumb src={p.image ? absoluteUrl(p.image, origin) : ""} className="h-[50px] w-[50px]" />
                    <span className="min-w-0">
                      <span className="mb-0.5 block text-sm font-bold leading-tight text-admin-gray-900">{p.title}</span>
                      <span className="block text-xs text-admin-gray-500">ID: {p.id}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ───────────────────────── History (view-logs.php) ───────────────────────── */

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

// "d M y • h:i a" like view-logs.php, fixed to India time so server and browser render the same text.
const WHEN_FMT = new Intl.DateTimeFormat("en-US", {
  day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
});
function when(iso: string): string {
  const p = Object.fromEntries(WHEN_FMT.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year} • ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}

const progressOf = (c: CampaignHistoryRow) => (c.totalSubscribers > 0 ? Math.min(100, Math.round((c.sent / c.totalSubscribers) * 1000) / 10) : 0);
const isLive = (s: string) => s === "pending" || s === "processing" || s === "sending";

function HistoryTab({ history, onPage, onCompose, onReuse, onDeleted, onError }: {
  history: Props["history"]; onPage: (p: number) => void; onCompose: () => void;
  onReuse: (c: CampaignHistoryRow) => void; onDeleted: (title: string) => void; onError: (text: string) => void;
}) {
  const router = useRouter();
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
    <RowMenu disabled={busy === c.id} items={[
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

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-admin-gray-600">
        <span className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-admin-gray-300")} />
          {live ? "Sending in progress • refreshing every 5s" : "Live status • auto-refresh every 30s"}
        </span>
        <span>Showing {first} to {first + history.rows.length - 1} of {formatInt(history.total)} campaigns</span>
      </div>

      {/* Desktop + tablet: table */}
      <div className={cn(CARD, "hidden overflow-x-auto md:block")}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-admin-gray-200 bg-admin-gray-50 text-xs font-semibold uppercase tracking-wide text-admin-gray-500">
            <tr>
              <th className="px-4 py-3">Campaign / Post</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Sent / Failed</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-gray-100">
            {history.rows.map((c) => {
              const pct = progressOf(c);
              return (
                <tr key={c.id} className={cn("align-middle hover:bg-admin-gray-50/60", busy === c.id && "opacity-50")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Thumb src={c.image ?? ""} className="h-[60px] w-[60px]" />
                      <div className="min-w-0">
                        <div className="max-w-[320px] truncate text-[15px] font-semibold text-admin-gray-900">{c.title || "Custom Push"}</div>
                        {c.post && <div className="max-w-[320px] truncate text-xs text-[#2563eb]">{c.post.title}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="w-[160px] px-4 py-3">
                    <Progress pct={pct} />
                    <span className="text-xs text-admin-gray-500">{pct}%</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <b className="text-emerald-600">{formatInt(c.sent)}</b>
                    <span className="ml-2 text-xs text-red-500">/ {formatInt(c.failed)}</span>
                  </td>
                  <td className="px-4 py-3">{formatInt(c.totalSubscribers)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-admin-gray-500">{when(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">{actions(c)}</td>
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
                <Thumb src={c.image ?? ""} className="h-[50px] w-[50px]" />
                <div className="min-w-0 flex-1">
                  <div className="break-words font-semibold text-admin-gray-900">{c.title || "Custom Push"}</div>
                  {c.post && <div className="truncate text-xs text-[#2563eb]">{c.post.title}</div>}
                </div>
                {actions(c)}
              </div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <StatusBadge status={c.status} />
                <span className="text-xs text-admin-gray-500">{when(c.createdAt)}</span>
              </div>
              <Progress pct={pct} />
              <div className="mt-2 flex justify-between text-xs">
                <span><b className="text-emerald-600">{formatInt(c.sent)}</b> sent</span>
                <span><b className="text-red-500">{formatInt(c.failed)}</b> failed</span>
                <span>{formatInt(c.totalSubscribers)} total</span>
              </div>
            </div>
          );
        })}
      </div>

      {history.pageCount > 1 && <Pager page={history.page} pageCount={history.pageCount} onPage={onPage} />}

      {confirm && (
        <ConfirmDialog
          icon={<AlertTriangle className="h-6 w-6" />} tone="red"
          title="Delete Campaign?"
          text={<>Are you sure you want to delete &quot;{confirm.title || "Custom Push"}&quot;? This action cannot be undone.{isLive(confirm.status) && <> It is still sending — any notifications not yet delivered will be cancelled.</>}</>}
          confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
      )}
    </section>
  );
}

function Progress({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded bg-[#e9ecef]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-[#2563eb] transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** view-logs.php's pagination: first / prev / window of 3 with ellipses / next / last. */
function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (p: number) => void }) {
  const start = Math.max(1, page - 1);
  const end = Math.min(pageCount, page + 1);
  const nums: (number | "…")[] = [];
  if (start > 1) { nums.push(1); if (start > 2) nums.push("…"); }
  for (let i = start; i <= end; i++) nums.push(i);
  if (end < pageCount) { if (end < pageCount - 1) nums.push("…"); nums.push(pageCount); }

  const btn = "flex h-9 min-w-9 items-center justify-center border border-[#dee2e6] px-2.5 text-sm -ml-px first:ml-0 first:rounded-l-[0.375rem] last:rounded-r-[0.375rem]";
  const nav = cn(btn, "text-admin-gray-700 hover:bg-admin-gray-50 disabled:text-admin-gray-300 disabled:hover:bg-transparent");
  return (
    <nav className="flex justify-center" aria-label="Campaign pages">
      <button type="button" disabled={page === 1} onClick={() => onPage(1)} className={nav} aria-label="First page"><ChevronsLeft className="h-4 w-4" /></button>
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={nav} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
      {nums.map((n, i) => n === "…"
        ? <span key={`e${i}`} className={cn(btn, "text-admin-gray-400")}>…</span>
        : <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
            className={cn(btn, n === page ? "relative z-10 border-[#2563eb] bg-[#2563eb] text-white" : "text-[#2563eb] hover:bg-admin-gray-50")}>{n}</button>)}
      <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)} className={nav} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      <button type="button" disabled={page === pageCount} onClick={() => onPage(pageCount)} className={nav} aria-label="Last page"><ChevronsRight className="h-4 w-4" /></button>
    </nav>
  );
}

/** The ⋮ menu on each campaign row (Use again / View URL / Delete). */
function RowMenu({ items, disabled }: {
  items: { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void; danger?: boolean }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = menu.current?.offsetHeight ?? 130;
    const w = menu.current?.offsetWidth ?? 170;
    const openUp = r.bottom + h > window.innerHeight && r.top > h;
    setPos({ top: openUp ? r.top - h - 4 : r.bottom + 4, left: Math.max(8, r.right - w) });
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" disabled={disabled} aria-label="Campaign actions" aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[0.375rem] text-admin-gray-500 transition-colors hover:bg-admin-gray-100 hover:text-[#2563eb] disabled:opacity-50">
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && createPortal(
        <div ref={menu} role="menu" className="fixed z-50 min-w-[170px] overflow-hidden rounded-[0.5rem] border border-black/[0.08] bg-white py-1 text-sm shadow-lg"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}>
          {items.map((it, i) => (
            <div key={it.label}>
              {it.danger && i > 0 && <div className="my-1 h-px bg-admin-gray-100" />}
              <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}
                className={cn("flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors",
                  it.danger ? "text-red-600 hover:bg-[#f8d7da]" : "text-admin-gray-800 hover:bg-admin-gray-50")}>
                <it.icon className="h-4 w-4" /> {it.label}
              </button>
            </div>
          ))}
        </div>, document.body
      )}
    </>
  );
}

/* ───────────────────────── Settings (new) ───────────────────────── */

function SettingsTab({ settings, subscribers, onSaved, onError }: {
  settings: Props["settings"]; subscribers: number; onSaved: () => void; onError: (text: string) => void;
}) {
  const [publicKey, setPublicKey] = useState(settings.publicKey);
  const [privateKey, setPrivateKey] = useState("");
  const [subject, setSubject] = useState(settings.subject || "mailto:");
  const [showPrivate, setShowPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const keysChanged = settings.configured && (publicKey.trim() !== settings.publicKey || privateKey.trim() !== "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/push2/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey, privateKey, subject }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) { setPrivateKey(""); onSaved(); }
      else { setErr(data.error ?? "Couldn't save settings."); onError(data.error ?? "Couldn't save settings."); }
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={save} className={CARD}>
        <header className="flex items-center gap-2 border-b border-admin-gray-100 px-5 py-4">
          <KeyRound className="h-4 w-4 text-[#2563eb]" />
          <h2 className="text-base font-bold text-[#2563eb]">VAPID Keys</h2>
        </header>
        <div className="space-y-4 p-5">
          {err && <div role="alert" className="rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
          <div>
            <label htmlFor="vapid-public" className={LABEL}>Public Key <span className="text-red-500">*</span></label>
            <input id="vapid-public" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} required spellCheck={false} autoComplete="off"
              placeholder="Paste the public key (starts with B…)" className={cn(INPUT, "font-mono text-xs")} />
          </div>
          <div>
            <label htmlFor="vapid-private" className={LABEL}>Private Key {!settings.hasPrivateKey && <span className="text-red-500">*</span>}</label>
            <div className="relative">
              <input id="vapid-private" type={showPrivate ? "text" : "password"} value={privateKey} onChange={(e) => setPrivateKey(e.target.value)}
                required={!settings.hasPrivateKey} spellCheck={false} autoComplete="new-password"
                placeholder={settings.hasPrivateKey ? "•••••••••••• saved — leave blank to keep it" : "Paste the private key"}
                className={cn(INPUT, "pr-10 font-mono text-xs")} />
              <button type="button" onClick={() => setShowPrivate((s) => !s)} aria-label={showPrivate ? "Hide private key" : "Show private key"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-admin-gray-400 hover:text-admin-gray-700">
                {showPrivate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-admin-gray-500">Stored on the server only — it is never sent back to this page.</p>
          </div>
          <div>
            <label htmlFor="vapid-subject" className={LABEL}>Subject <span className="text-red-500">*</span></label>
            <input id="vapid-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="mailto:contact@example.com" className={INPUT} />
            <p className="mt-1 text-xs text-admin-gray-500">A <code>mailto:</code> address or <code>https://</code> URL push services can contact you at.</p>
          </div>

          {keysChanged && (
            <div className="flex items-start gap-2 rounded-[0.375rem] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Changing keys means the <b>{formatInt(subscribers)}</b> existing subscriber{subscribers === 1 ? "" : "s"} can no longer receive notifications until they subscribe again.</span>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={busy}
              className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save Settings
            </button>
          </div>
        </div>
      </form>

      <aside className={cn(CARD, "h-fit space-y-4 p-5 text-sm")}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-admin-gray-800">Status</span>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", settings.configured ? "bg-[#d1e7dd] text-[#0f5132]" : "bg-[#fff3cd] text-[#856404]")}>
            {settings.configured ? "Configured" : "Not configured"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-admin-gray-600">Subscribers</span>
          <b className="text-admin-gray-900">{formatInt(subscribers)}</b>
        </div>
        <hr className="border-admin-gray-100" />
        <div className="text-admin-gray-600">
          <p className="mb-2 font-semibold text-admin-gray-800">Need a key pair?</p>
          <p className="mb-2">Generate one on the server with:</p>
          <code className="block rounded-[0.375rem] bg-admin-gray-50 px-3 py-2 font-mono text-xs text-admin-gray-800">npx web-push generate-vapid-keys</code>
          <p className="mt-2">The public key must be the same one the storefront uses when visitors subscribe.</p>
        </div>
      </aside>
    </div>
  );
}

/* ───────────────────────── shared pieces ───────────────────────── */

function StatCard({ icon: Icon, tint, value, label }: { icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string }) {
  return (
    <div className={cn(CARD, "flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5")}>
      <span className={cn("hidden h-12 w-12 shrink-0 items-center justify-center rounded-full sm:flex", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0"><span className="block text-xl font-bold leading-tight text-admin-gray-900 sm:text-2xl">{formatInt(value)}</span><span className="block text-sm text-admin-gray-600">{label}</span></span>
    </div>
  );
}

/** A square thumbnail that falls back to a bell icon when there's no image or it fails to load. */
function Thumb({ src, className }: { src: string; className: string }) {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [src]);
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e9ecef]", className)}>
      {src && ok
        // eslint-disable-next-line @next/next/no-img-element -- uploads/external URLs, not optimisable
        ? <img src={src} alt="" onError={() => setOk(false)} className="h-full w-full object-cover" />
        : <Bell className="h-5 w-5 text-admin-gray-400" />}
    </span>
  );
}

function ConfirmDialog({ icon, tone, title, text, confirmLabel, onCancel, onConfirm }: {
  icon: React.ReactNode; tone: "red" | "blue"; title: string; text: React.ReactNode; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[4px]" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-[400px] rounded-2xl bg-white p-8 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className={cn("mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-full",
          tone === "red" ? "bg-[#f8d7da] text-[#dc3545]" : "bg-blue-50 text-[#2563eb]")}>{icon}</div>
        <div className="mb-2 text-xl font-semibold text-admin-gray-900">{title}</div>
        <div className="mb-6 text-[0.95rem] text-admin-gray-500">{text}</div>
        <div className="flex justify-center gap-3">
          <button type="button" onClick={onCancel} className="h-10 rounded-[0.5rem] bg-[#e9ecef] px-6 text-sm font-medium text-[#495057] hover:bg-[#dee2e6]">Cancel</button>
          <button type="button" autoFocus onClick={onConfirm}
            className={cn("h-10 rounded-[0.5rem] px-6 text-sm font-semibold text-white", tone === "red" ? "bg-[#dc3545] hover:bg-[#bb2d3b]" : "bg-[#2563eb] hover:bg-[#1d4ed8]")}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
