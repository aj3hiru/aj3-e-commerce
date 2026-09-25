"use client";

import { storeOrigin } from "@/lib/hosts";
import { useEffect, useMemo, useState } from "react";
import {
  Bell, Send, History, Smartphone, Loader2, CheckCircle2, AlertCircle, X, PenSquare, Package, FolderTree, Tag, FileText,
  Link2, Sparkles, ChevronDown, RefreshCw, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneFrame } from "@/components/admin/PhoneFrame";
import { formatInt } from "@/lib/format";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import type { PushCatalog, PushProductHit } from "@/lib/push-catalog";
import { CARD, INPUT, LABEL, SECTION_LABEL, ConfirmDialog, Thumb, absoluteUrl, rupees } from "./ui";
import {
  BrandPicker, CategoryPicker, PostPicker, PriceLine, ProductPicker, StockBadge,
  type BrandPick, type CategoryPick, type PostHit,
} from "./pickers";

/* ───────────────────────── draft model ───────────────────────── */

export type Target =
  | { type: "product"; product: PushProductHit }
  | { type: "category"; category: CategoryPick }
  | { type: "brand"; brand: BrandPick }
  | { type: "post"; post: PostHit }
  | { type: "reuse"; label: string; image: string }; // loaded from a past campaign

export type Kind = "product" | "category" | "brand" | "post" | "custom";

export interface Draft {
  kind: Kind; // which link type is selected
  target: Target | null; // what was picked for it (null = nothing yet / custom URL)
  url: string;
  title: string;
  body: string;
  image: string;
  utm: boolean;
}

/** An e-commerce push usually promotes a product, so that's the starting point. */
export function emptyDraft(): Draft { return { kind: "product", target: null, url: "", title: "", body: "", image: "", utm: true }; }
const KINDS: { value: Kind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "product", label: "Product", icon: Package },
  { value: "category", label: "Category", icon: FolderTree },
  { value: "brand", label: "Brand", icon: Tag },
  { value: "post", label: "Blog Post", icon: FileText },
  { value: "custom", label: "Custom URL", icon: Link2 },
];

const TITLE_MAX = 50; // Android shows ~45–50 chars before cutting the title
const BODY_MAX = 120; // and roughly two lines of body text

/* ───────────────────────── links & templates ───────────────────────── */

function targetUrl(t: Target, origin: string): string | null {
  const o = origin.replace(/\/$/, "");
  switch (t.type) {
    case "product": return `${o}/product?slug=${encodeURIComponent(t.product.slug)}`;
    case "category": return t.category.kind === "subcategory"
      ? `${o}/category?slug=${encodeURIComponent(t.category.parentSlug ?? "")}&sub=${encodeURIComponent(t.category.slug)}`
      : `${o}/category?slug=${encodeURIComponent(t.category.slug)}`;
    case "brand": return `${o}/?q=${encodeURIComponent(t.brand.name)}`;
    case "post": return `${o}/${t.post.slug}`;
    default: return null;
  }
}

function targetImage(t: Target, origin: string): string {
  switch (t.type) {
    case "product": return absoluteUrl(t.product.image, origin);
    case "category": return absoluteUrl(t.category.image, origin);
    case "brand": return absoluteUrl(t.brand.logo, origin);
    case "post": return absoluteUrl(t.post.image, origin);
    case "reuse": return t.image;
    default: return "";
  }
}

interface Template { id: string; label: string; title: string; body: string }

/** Ready-made copy for what's being promoted; admins can edit it afterwards. */
function templatesFor(kind: Kind, t: Target | null, shop: string): Template[] {
  if (!t) return kind === "custom" ? customTemplates(shop) : [];
  if (t.type === "product") {
    const p = t.product;
    const price = rupees(p.finalPrice);
    const list: Template[] = [];
    if (p.discountPct > 0) list.push({ id: "deal", label: "🔥 Deal", title: `🔥 ${p.discountPct}% OFF — ${p.name}`, body: `Now ${price} (was ${rupees(p.price)}). Grab it before the offer ends!` });
    list.push({ id: "new", label: "✨ New arrival", title: `✨ New arrival: ${p.name}`, body: `Just landed at ${shop} for ${price}. Tap to check it out.` });
    if (p.stockState === "low") list.push({ id: "low", label: "⏳ Few left", title: `⏳ Only ${p.stockQty} left — ${p.name}`, body: `Selling fast! Get yours now for ${price} before it's gone.` });
    list.push({ id: "back", label: "✅ Back in stock", title: `✅ Back in stock: ${p.name}`, body: `It's back! Order now for ${price} before it sells out again.` });
    list.push({ id: "pick", label: "⭐ Top pick", title: `⭐ Today's pick: ${p.name}`, body: `Customers love it — just ${price} at ${shop}. Tap to shop.` });
    return list;
  }
  if (t.type === "category") {
    const c = t.category;
    const n = c.productCount > 0 ? `${formatInt(c.productCount)}+ ` : "";
    return [
      { id: "explore", label: "🛍️ Explore", title: `🛍️ Explore ${c.name}`, body: `${n}products in ${c.name} at ${shop}. Tap to shop now.` },
      { id: "sale", label: "🔥 Sale", title: `🔥 Big savings on ${c.name}`, body: `Top picks in ${c.name} at great prices. Limited time only!` },
      { id: "new", label: "✨ New stock", title: `✨ Fresh arrivals in ${c.name}`, body: `New ${c.name} just added at ${shop}. Be the first to shop!` },
    ];
  }
  if (t.type === "brand") {
    const b = t.brand;
    return [
      { id: "brand", label: "⭐ Featured brand", title: `⭐ ${b.name} at ${shop}`, body: `Shop ${formatInt(b.productCount)} ${b.name} products. Tap to explore.` },
      { id: "sale", label: "🔥 Brand sale", title: `🔥 Deals on ${b.name}`, body: `Special prices on ${b.name} — for a limited time only!` },
    ];
  }
  if (t.type === "post") {
    return [{ id: "post", label: "📰 New post", title: t.post.title, body: "New government job alert! Check it out." }];
  }
  return customTemplates(shop);
}

function customTemplates(shop: string): Template[] {
  return [
    { id: "announce", label: "📢 Announcement", title: `📢 News from ${shop}`, body: "Tap to see what's new." },
    { id: "sale", label: "🎉 Store-wide sale", title: `🎉 Sale is live at ${shop}!`, body: "Big discounts across the store. Shop now before it ends!" },
  ];
}

/** Adds utm_* tags so Analytics can attribute visits to this push — only for links on our own site. */
export function withUtm(url: string, title: string, origin: string): string {
  try {
    const u = new URL(url);
    if (u.host !== new URL(origin).host) return url;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "push";
    u.searchParams.set("utm_source", "push");
    u.searchParams.set("utm_medium", "web_push");
    u.searchParams.set("utm_campaign", slug);
    return u.toString();
  } catch {
    return url;
  }
}

/* ───────────────────────── Compose tab ───────────────────────── */

export function ComposeTab({ draft, setDraft, catalog, appName, siteUrl, configured, subscribers, onSent, onViewProgress }: {
  draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; catalog: PushCatalog; appName: string; siteUrl: string;
  configured: boolean; subscribers: number; onSent: () => void; onViewProgress: () => void;
}) {
  const { isVisible: show } = useDashboardWidgetPrefs();
  const [origin, setOrigin] = useState(siteUrl);
  useEffect(() => { if (!siteUrl) setOrigin(storeOrigin()); }, [siteUrl]);

  const kind = draft.kind;
  // Display Options → "Promote options" decides which link types are offered.
  const kinds = show("pm2-types") ? KINDS.filter((k) => show(`pm2-t-${k.value}`)) : [];
  const kindsKey = kinds.map((k) => k.value).join(",");
  useEffect(() => {
    // The selected type was hidden: fall back to the first one still offered
    // (or a plain custom link when none are), keeping whatever was typed.
    if (kinds.length === 0) { if (draft.kind !== "custom") setDraft((d) => ({ ...d, kind: "custom", target: null })); return; }
    if (!kinds.some((k) => k.value === draft.kind)) setDraft((d) => ({ ...d, kind: kinds[0].value, target: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindsKey]);
  const [picker, setPicker] = useState<Kind | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // Remember what the last template wrote, so re-picking a target only replaces
  // text the admin hasn't edited by hand.
  const [lastAuto, setLastAuto] = useState<{ title: string; body: string } | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const templates = useMemo(() => templatesFor(draft.kind, draft.target, appName), [draft.kind, draft.target, appName]);
  const finalUrl = draft.utm && show("pm2-c-utm") ? withUtm(draft.url.trim(), draft.title, origin) : draft.url.trim();
  const hasTarget = !!draft.target && draft.target.type !== "reuse";
  const canSend = configured && draft.title.trim() !== "" && draft.url.trim() !== "" && !sending;

  function applyTemplate(t: Template) {
    set({ title: t.title, body: t.body });
    setLastAuto({ title: t.title, body: t.body });
  }

  function chooseTarget(target: Target) {
    const tpl = templatesFor(target.type as Kind, target, appName)[0];
    setDraft((d) => {
      const untouched = (!d.title && !d.body) || (lastAuto && d.title === lastAuto.title && d.body === lastAuto.body);
      return {
        ...d, kind: target.type as Kind, target,
        url: targetUrl(target, origin) ?? d.url,
        image: targetImage(target, origin) || d.image,
        ...(untouched && tpl ? { title: tpl.title, body: tpl.body } : {}),
      };
    });
    if (tpl) setLastAuto({ title: tpl.title, body: tpl.body });
    setPicker(null);
  }

  function switchKind(k: Kind) {
    // Switching type drops the old pick (its URL/text stay, so nothing typed is lost).
    setDraft((d) => ({ ...d, kind: k, target: d.target && (d.target.type === k || (k === "custom" && d.target.type === "reuse")) ? d.target : null }));
    if (k !== "custom") setPicker(k);
  }

  async function send() {
    setConfirmOpen(false);
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/push2/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title, body: draft.body, url: finalUrl, image: draft.image || null,
          postId: draft.target?.type === "post" ? draft.target.post.id : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        const n = Number(data.totalSubscribers ?? 0);
        setResult({ ok: true, text: `Queued for ${formatInt(n)} subscriber${n === 1 ? "" : "s"} — it goes out after any campaign already sending.` });
        setLastAuto(null);
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

  const counter = (len: number, max: number) => show("pm2-c-counters") && (
    <span className={cn("text-[11px] tabular-nums", len > max ? "font-semibold text-amber-600" : "text-admin-gray-400")}
      title={len > max ? "Longer than most phones show — it may be cut off" : undefined}>{len}/{max}</span>
  );

  const leftVisible = ["pm2-c-target", "pm2-c-templates", "pm2-c-fields", "pm2-c-actions"].some(show);
  const rightVisible = show("pm2-c-preview");

  return (
    <div className={cn("grid grid-cols-1 gap-5", leftVisible && rightVisible && "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
      {leftVisible && (
        <section className={CARD}>
          <header className="flex items-center gap-2 border-b border-admin-gray-100 px-5 py-4">
            <PenSquare className="h-4 w-4 text-[#2563eb]" />
            <h2 className="text-base font-bold text-[#2563eb]">Compose Notification</h2>
          </header>
          <div className="space-y-6 p-5">
            {show("pm2-c-target") && kinds.length > 0 && (
              <div>
                <span className={SECTION_LABEL}>1. What are you promoting?</span>
                <div role="radiogroup" aria-label="Link type"
                  className={cn("grid gap-1.5", kinds.length >= 3 ? "grid-cols-3" : kinds.length === 2 ? "grid-cols-2" : "grid-cols-1",
                    { 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[kinds.length])}>
                  {kinds.map((k) => (
                    <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} onClick={() => switchKind(k.value)}
                      className={cn("flex flex-col items-center gap-1 rounded-[0.5rem] border px-2 py-2.5 text-xs font-medium transition-colors",
                        kind === k.value ? "border-[#2563eb] bg-blue-50 text-[#2563eb]" : "border-[#dee2e6] text-admin-gray-700 hover:bg-admin-gray-50")}>
                      <k.icon className="h-5 w-5" /> {k.label}
                    </button>
                  ))}
                </div>
                {hasTarget && draft.target ? (
                  <>
                    <TargetCard target={draft.target} origin={origin} onChange={() => setPicker(kind)} onClear={() => set({ target: null })} />
                    {draft.target.type === "product" && draft.target.product.stockState === "out" && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        This product is out of stock — shoppers who tap the notification won&apos;t be able to buy it yet.
                      </p>
                    )}
                  </>
                ) : draft.target?.type === "reuse" ? (
                  <div className="mt-3 flex items-center gap-3 rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50 p-2.5 text-sm">
                    <RefreshCw className="h-4 w-4 shrink-0 text-admin-gray-500" />
                    <span className="min-w-0 flex-1 truncate">Reusing <b>{draft.target.label}</b> — edit anything below.</span>
                    <button type="button" onClick={() => set({ target: null })} aria-label="Clear" className="rounded p-1 text-admin-gray-400 hover:bg-admin-gray-100"><X className="h-4 w-4" /></button>
                  </div>
                ) : kind !== "custom" ? (
                  <button type="button" onClick={() => setPicker(kind)}
                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[0.375rem] border border-dashed border-[#93c5fd] bg-blue-50/50 text-sm font-semibold text-[#2563eb] hover:bg-blue-50">
                    Choose a {KINDS.find((k) => k.value === kind)!.label.toLowerCase()} <ChevronDown className="h-4 w-4" />
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-admin-gray-500">Custom link — type any URL below (your own site or elsewhere).</p>
                )}
              </div>
            )}

            {show("pm2-c-templates") && templates.length > 0 && (
              <div>
                <span className={SECTION_LABEL}><Sparkles className="mr-1 inline h-3.5 w-3.5" />2. Message template</span>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => {
                    const active = draft.title === t.title && draft.body === t.body;
                    return (
                      <button key={t.id} type="button" onClick={() => applyTemplate(t)} aria-pressed={active}
                        className={cn("h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                          active ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-[#dee2e6] text-admin-gray-700 hover:border-[#2563eb] hover:text-[#2563eb]")}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {show("pm2-c-fields") && (
              <div className="space-y-3.5">
                <span className={SECTION_LABEL}>3. Notification details</span>
                <div>
                  <label htmlFor="push-url" className={LABEL}>Target URL <span className="text-red-500">*</span></label>
                  <input id="push-url" type="url" value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://example.com/my-page" className={INPUT} />
                </div>
                <div>
                  <div className="flex items-end justify-between"><label htmlFor="push-title" className={LABEL}>Title <span className="text-red-500">*</span></label>{counter(draft.title.length, TITLE_MAX)}</div>
                  <input id="push-title" type="text" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="Notification Title" maxLength={120} className={INPUT} />
                </div>
                <div>
                  <div className="flex items-end justify-between"><label htmlFor="push-body" className={LABEL}>Message Body</label>{counter(draft.body.length, BODY_MAX)}</div>
                  <textarea id="push-body" rows={2} value={draft.body} onChange={(e) => set({ body: e.target.value })} placeholder="Short description..." maxLength={300} className={cn(INPUT, "h-auto py-2")} />
                </div>
                <div>
                  <label htmlFor="push-image" className={LABEL}>Banner Image URL</label>
                  <input id="push-image" type="text" value={draft.image} onChange={(e) => set({ image: e.target.value })} placeholder="https://..." className={INPUT} />
                </div>
              </div>
            )}

            {show("pm2-c-utm") && (
              <div className="rounded-[0.5rem] border border-admin-gray-200 p-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={draft.utm} onChange={(e) => set({ utm: e.target.checked })} className="h-4 w-4 accent-[#2563eb]" />
                  <span className="flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-admin-gray-800"><BarChart3 className="h-4 w-4 text-admin-gray-500" /> Add UTM tracking</span>
                    <span className="block text-xs text-admin-gray-500">Tags links to your site so visits from this push show up in analytics.</span>
                  </span>
                </label>
                {draft.utm && draft.url && finalUrl !== draft.url.trim() && (
                  <p className="mt-2 break-all rounded bg-admin-gray-50 px-2 py-1.5 font-mono text-[11px] text-admin-gray-600">{finalUrl}</p>
                )}
              </div>
            )}

            {show("pm2-c-actions") && (
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
                {configured && subscribers === 0 && <p className="text-xs text-amber-700">No subscribers yet — shoppers subscribe from the &quot;Allow Notifications&quot; prompt on the store.</p>}
              </div>
            )}

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
      )}

      {rightVisible && (
        <aside className="flex flex-col items-center lg:sticky lg:top-5 lg:self-start">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-admin-gray-500">
            <Smartphone className="h-3.5 w-3.5" /> Live Lock Screen Preview
          </h3>
          <PhonePreview appName={appName} title={draft.title} body={draft.body} image={draft.image} />
          {show("pm2-c-note") && (
            <p className="mt-3 max-w-[300px] px-4 text-center text-[11px] text-admin-gray-500">*Preview renders roughly how it appears on modern Android devices.</p>
          )}
        </aside>
      )}

      {picker === "product" && <ProductPicker catalog={catalog} origin={origin} selectedId={draft.target?.type === "product" ? draft.target.product.id : null}
        onPick={(product) => chooseTarget({ type: "product", product })} onClose={() => setPicker(null)} />}
      {picker === "category" && <CategoryPicker catalog={catalog} origin={origin} onPick={(category) => chooseTarget({ type: "category", category })} onClose={() => setPicker(null)} />}
      {picker === "brand" && <BrandPicker catalog={catalog} origin={origin} onPick={(brand) => chooseTarget({ type: "brand", brand })} onClose={() => setPicker(null)} />}
      {picker === "post" && <PostPicker origin={origin} onPick={(post) => chooseTarget({ type: "post", post })} onClose={() => setPicker(null)} />}

      {confirmOpen && (
        <ConfirmDialog icon={<Send className="h-6 w-6" />} tone="blue" title="Send this notification?"
          text={<>&quot;{draft.title}&quot; will be sent to <b>{formatInt(subscribers)}</b> subscriber{subscribers === 1 ? "" : "s"}.<span className="mt-2 block break-all text-xs text-admin-gray-400">{finalUrl}</span></>}
          confirmLabel="Send Now" onCancel={() => setConfirmOpen(false)} onConfirm={send} />
      )}
    </div>
  );
}

/** The selected product / category / brand / post, with the details that matter for a push. */
function TargetCard({ target, origin, onChange, onClear }: { target: Target; origin: string; onChange: () => void; onClear: () => void }) {
  let icon = Package, kicker = "", name = "", meta: React.ReactNode = null;
  if (target.type === "product") {
    const p = target.product;
    kicker = [p.category, p.subcategory].filter(Boolean).join(" › ") || "Product";
    name = p.name;
    meta = <span className="mt-1 flex flex-wrap items-center gap-2"><PriceLine p={p} className="text-sm" /><StockBadge p={p} /></span>;
  } else if (target.type === "category") {
    icon = FolderTree;
    kicker = target.category.kind === "subcategory" ? `Subcategory of ${target.category.parentName}` : "Category";
    name = target.category.name;
    meta = <span className="text-xs text-admin-gray-500">{formatInt(target.category.productCount)} products</span>;
  } else if (target.type === "brand") {
    icon = Tag; kicker = "Brand"; name = target.brand.name;
    meta = <span className="text-xs text-admin-gray-500">{formatInt(target.brand.productCount)} products</span>;
  } else if (target.type === "post") {
    icon = FileText; kicker = "Linked Post"; name = target.post.title;
    meta = <span className="text-xs text-admin-gray-500">ID: {target.post.id}</span>;
  }
  return (
    <div className="mt-3 flex items-center gap-3 rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50 p-2.5">
      <Thumb src={targetImage(target, origin)} className="h-[64px] w-[64px]" icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-admin-gray-500">{kicker}</div>
        <div className="line-clamp-2 text-sm font-bold leading-tight text-admin-gray-900">{name}</div>
        {meta}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" onClick={onChange} className="rounded px-2 py-1 text-xs font-semibold text-[#2563eb] hover:bg-blue-50">Change</button>
        <button type="button" onClick={onClear} aria-label="Remove" className="rounded p-1 text-admin-gray-400 hover:bg-admin-gray-100 hover:text-admin-gray-700"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/** The smartphone lock-screen mockup (PhoneFrame): clock/date,
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
    <PhoneFrame width={292} height={592} status="light" overlay>
      <div className="relative h-full w-full bg-[linear-gradient(135deg,#667eea_0%,#764ba2_100%)] pt-[60px]" style={{ fontFamily: "Roboto, system-ui, sans-serif" }}>
        <div className="mb-5 h-[62px] text-center text-[52px] font-light leading-none text-white/80" suppressHydrationWarning>{time}</div>
        <div className="-mt-2.5 mb-[30px] h-5 text-center text-sm text-white/80" suppressHydrationWarning>{date}</div>

        <div key={`${title}|${image}`} className="mx-[15px] animate-[pm2-slide-in_0.3s_ease-out] overflow-hidden rounded-xl bg-white/95 shadow-[0_4px_15px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-between px-3 pb-1 pt-2.5 text-[11px] text-[#555]">
            <div className="flex min-w-0 items-center gap-[5px]">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#2563eb] text-white"><Bell className="h-2.5 w-2.5" /></span>
              <span className="truncate font-bold">{appName}</span>
            </div>
            <span className="flex shrink-0 items-center">now <ChevronDown className="ml-1 h-3 w-3" /></span>
          </div>
          <div className="px-3 pb-3 pt-1">
            <div className="mb-0.5 line-clamp-1 break-words text-sm font-bold leading-tight text-[#222]">{title || "Notification Title"}</div>
            <div className="mb-2 line-clamp-2 break-words text-xs leading-snug text-[#444]">{body || "Notification body text..."}</div>
            {image && imgOk && (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL typed by the admin
              <img src={image} alt="" onError={() => setImgOk(false)} className="mt-1 block h-[120px] w-full rounded-lg object-cover" />
            )}
          </div>
        </div>
      </div>
      <style>{"@keyframes pm2-slide-in{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}"}</style>
    </PhoneFrame>
  );
}
