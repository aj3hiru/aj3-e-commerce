"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, ExternalLink, Loader2, Monitor, RefreshCw, RotateCcw, ShoppingBag, Smartphone, Upload, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneFrame } from "@/components/admin/PhoneFrame";
import { LINK_PRESETS, isSafeHref } from "@/types/storefront";

/** Shared building blocks of the Store Customizer (Homepage, Product Page, Header & Footer). */

export interface PickCategory { slug: string; name: string; image: string | null }
export interface PickProduct { id: number; name: string; image: string | null }

export const INPUT = "w-full rounded-md border border-admin-gray-200 bg-white px-3 py-2 text-sm text-admin-gray-800 placeholder:text-admin-gray-400 focus:border-admin-primary focus:outline-none focus:ring-2 focus:ring-admin-primary/15";
export const imgSrc = (p: string) => (/^https:/.test(p) ? p : `/${p}`);
export const rid = () => Math.random().toString(36).slice(2, 10);

/* ───────────────────────── small controls ───────────────────────── */

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-admin-primary" : "bg-admin-gray-300")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-admin-gray-700">
      {children}{hint && <span className="font-normal text-admin-gray-400">{hint}</span>}
    </span>
  );
}

export function Text({ label, value, onChange, max, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <Label hint={hint ?? `${value.length}/${max}`}>{label}</Label>
      <input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={INPUT} />
    </label>
  );
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-1.5 text-sm text-admin-gray-700 hover:bg-admin-gray-50">
      <span>{children}</span>
      <Switch on={on} onChange={onChange} label={typeof children === "string" ? children : "Toggle"} />
    </label>
  );
}

export function ColorInput({ label, value, onChange, swatches }: { label: string; value: string; onChange: (v: string) => void; swatches?: string[] }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-admin-gray-200 bg-white p-0.5" />
        <input value={text} maxLength={7} className={cn(INPUT, "font-mono uppercase")}
          onChange={(e) => { setText(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} />
      </div>
      {swatches && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {swatches.map((c) => (
            <button key={c} type="button" onClick={() => onChange(c)} aria-label={`Use ${c}`} title={c}
              className={cn("grid h-7 w-7 place-items-center rounded-full ring-offset-2 transition", value === c ? "ring-2 ring-admin-gray-800" : "hover:scale-110")} style={{ background: c }}>
              {value === c && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LinkInput({ label, value, onChange, categories, optional }: { label: string; value: string; onChange: (v: string) => void; categories: PickCategory[]; optional?: boolean }) {
  const listId = useMemo(() => `links-${rid()}`, []);
  const bad = value.trim() !== "" && !isSafeHref(value);
  return (
    <label className="block">
      <Label hint={optional ? "Optional" : undefined}>{label}</Label>
      <input value={value} list={listId} onChange={(e) => onChange(e.target.value)} placeholder="/shop, /shop/category?slug=…, https://…"
        className={cn(INPUT, bad && "border-red-400 focus:border-red-500 focus:ring-red-100")} aria-invalid={bad} />
      <datalist id={listId}>
        {LINK_PRESETS.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}
        <option value="/shop?sort=discount">Deals (biggest discount)</option>
        <option value="/shop?sort=new">New arrivals</option>
        {categories.map((c) => <option key={c.slug} value={`/shop/category?slug=${encodeURIComponent(c.slug)}`}>{`Category: ${c.name}`}</option>)}
      </datalist>
      {bad && <span className="mt-1 block text-[11px] text-red-600">Use a site path (/…) or a full https:// link.</span>}
    </label>
  );
}

export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/ecommerce/home-customizer/upload", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
  if (!res?.success) throw new Error(res?.message || "Upload failed.");
  return res.path as string;
}

export function ImageField({ label, value, onChange, hint, aspect = "aspect-[2/1]" }: { label: string; value: string; onChange: (v: string) => void; hint?: string; aspect?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true); setErr("");
    try { onChange(await uploadImage(f)); } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(false);
  }
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
        className={cn("group relative overflow-hidden rounded-lg border-2 border-dashed border-admin-gray-200 bg-admin-gray-50", aspect)}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc(value)} alt="" className="h-full w-full object-contain" />
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-1 text-admin-gray-400 hover:text-admin-primary">
            <Upload className="h-5 w-5" /><span className="text-xs font-medium">Click or drop an image</span>
          </button>
        )}
        {value && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition group-hover:opacity-100">
            <button type="button" onClick={() => input.current?.click()} className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-admin-gray-800">Replace</button>
            <button type="button" onClick={() => onChange("")} className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600">Remove</button>
          </div>
        )}
        {busy && <div className="absolute inset-0 grid place-items-center bg-white/70"><Loader2 className="h-5 w-5 animate-spin text-admin-primary" /></div>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <p className="mt-1 text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

/** A collapsible card in the left panel. */
export function Card({ icon: Icon, title, subtitle, open, onToggle, enabled, onEnabled, children, tone = "default" }: {
  icon: LucideIcon; title: string; subtitle?: string; open: boolean; onToggle: () => void;
  enabled?: boolean; onEnabled?: (v: boolean) => void; children: React.ReactNode; tone?: "default" | "muted";
}) {
  return (
    <section className={cn("rounded-xl border bg-white shadow-sm transition", open ? "border-admin-primary/40 ring-2 ring-admin-primary/10" : "border-admin-gray-200")}>
      <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="flex cursor-pointer select-none items-center gap-3 px-4 py-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone === "muted" ? "bg-admin-gray-100 text-admin-gray-500" : "bg-admin-primary-lighter text-admin-primary")}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-admin-gray-800">{title}</span>
          {subtitle && <span className="block truncate text-xs text-admin-gray-500">{subtitle}</span>}
        </span>
        {onEnabled && <Switch on={!!enabled} onChange={onEnabled} label={`Show ${title}`} />}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-admin-gray-400 transition-transform", open && "rotate-180")} />
      </div>
      {open && <div className="space-y-4 border-t border-admin-gray-100 px-4 pb-4 pt-4">{children}</div>}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="grid rounded-lg bg-admin-gray-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={cn("rounded-md px-2 py-1.5 text-xs font-semibold transition", value === o.v ? "bg-white text-admin-primary shadow-sm" : "text-admin-gray-500 hover:text-admin-gray-800")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactElement<{ className?: string }> }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md text-admin-gray-500 transition hover:bg-admin-gray-100 disabled:opacity-30 disabled:hover:bg-transparent [&>svg]:h-3.5 [&>svg]:w-3.5",
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:text-admin-gray-800")}>
      {children}
    </button>
  );
}

export function Thumb({ src, round }: { src: string | null; round?: boolean }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={imgSrc(src)} alt="" className={cn("h-8 w-8 shrink-0 object-cover", round ? "rounded-full" : "rounded")} />
    : <span className={cn("grid h-8 w-8 shrink-0 place-items-center bg-admin-gray-100 text-admin-gray-400", round ? "rounded-full" : "rounded")}><ShoppingBag className="h-3.5 w-3.5" /></span>;
}

/* ───────────────────────── preview ───────────────────────── */

/**
 * Two stacked iframes: the next render loads in the hidden one and is swapped
 * in (at the same scroll position) once it's ready, so the preview never flashes.
 */
export function Preview({ url, version, device, focus, anchor }: { url: string; version: number; device: "mobile" | "desktop"; focus: { id: string; n: number } | null; anchor?: string }) {
  const full = `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const [front, setFront] = useState(0);
  const [srcs, setSrcs] = useState<[string, string]>([full, "about:blank"]);
  const [loading, setLoading] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(900);
  const pending = useRef<number | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const back = 1 - front;
    const y = frames[front].current?.contentWindow?.scrollY ?? 0;
    pending.current = y;
    setLoading(true);
    setSrcs((s) => { const n: [string, string] = [...s]; n[back] = full; return n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  function onLoad(i: number) {
    if (srcs[i] === "about:blank") return;
    const w = frames[i].current?.contentWindow;
    // Always open at `anchor` (e.g. the footer); otherwise keep the scroll position across reloads.
    const target = anchor ? frames[i].current?.contentDocument?.querySelector(`[data-hc="${anchor}"]`) : null;
    if (target) target.scrollIntoView({ block: "end" });
    else if (i !== front && w && pending.current) w.scrollTo(0, pending.current);
    if (i !== front) setFront(i);
    setLoading(false);
  }

  useEffect(() => {
    if (!focus) return;
    const doc = frames[front].current?.contentDocument;
    const el = doc?.querySelector<HTMLElement>(`[data-hc="${focus.id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.animate([{ outline: "3px solid #7c3aed", outlineOffset: "-3px" }, { outline: "3px solid rgba(124,58,237,0)", outlineOffset: "-3px" }], { duration: 1400, easing: "ease-out" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const W = device === "mobile" ? 375 : 1280;
  const scale = device === "mobile" ? 1 : Math.min(1, (boxW - 32) / W);
  const iframes = [0, 1].map((i) => (
    <iframe key={i} ref={frames[i]} src={srcs[i]} title={i === front ? "Store preview" : "Preview buffer"} onLoad={() => onLoad(i)}
      className={cn("absolute inset-0 h-full w-full border-0 bg-white", i === front ? "z-10" : "z-0 opacity-0")} />
  ));
  return (
    <div ref={box} className="relative flex h-full items-start justify-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_1px_1px,#d4d4dc_1px,transparent_0)] [background-size:18px_18px] bg-admin-gray-100 px-4 py-6">
      {device === "mobile" ? (
        <PhoneFrame width={W} height={780} fill>{iframes}</PhoneFrame>
      ) : (
        <div className="relative shrink-0 overflow-hidden rounded-lg border border-admin-gray-300 bg-white shadow-2xl" style={{ width: W * scale, height: "100%" }}>
          <div style={{ width: W, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0" }} className="relative">{iframes}</div>
        </div>
      )}
      {loading && (
        <span className="absolute right-6 top-6 z-20 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-admin-gray-600 shadow">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-admin-primary" /> Updating preview
        </span>
      )}
    </div>
  );
}


/* ───────────────────────── draft editor ───────────────────────── */

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Draft/publish state for a customizer tab: edits autosave to the draft
 * (debounced) and bump `version` so the preview reloads; publish copies the
 * draft live. `endpoint` takes POST {action: "draft" | "publish", config}.
 */
export function useDraftEditor<T>(initialDraft: T, initialLive: T, endpoint: string, check: (c: T) => string) {
  const [config, setConfig] = useState(initialDraft);
  const problem = check(config);
  const [serverDraft, setServerDraft] = useState(JSON.stringify(initialDraft));
  const [live, setLive] = useState(JSON.stringify(initialLive));
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState("");
  const sent = useRef(JSON.stringify(initialDraft));

  const post = async (action: "draft" | "publish", cfg: T): Promise<T> => {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, config: cfg }) })
      .then((r) => r.json()).catch(() => null);
    if (!res?.success) throw new Error(res?.message || "Couldn't save — check your connection.");
    return res.config as T;
  };

  useEffect(() => {
    const json = JSON.stringify(config);
    if (json === sent.current || problem) return;
    const t = setTimeout(async () => {
      sent.current = json;
      setSave("saving");
      try {
        setServerDraft(JSON.stringify(await post("draft", config)));
        setSave("saved"); setError("");
        setVersion((v) => v + 1);
      } catch (e) {
        sent.current = "";
        setSave("error"); setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    }, 300); // near-live: save the draft right after typing pauses, then the preview swaps in
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, problem]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === "saving" || JSON.stringify(config) !== sent.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [config, save]);

  async function publish() {
    if (problem) return;
    setPublishing(true);
    try {
      const j = JSON.stringify(await post("publish", config));
      sent.current = JSON.stringify(config);
      setServerDraft(j); setLive(j); setSave("saved"); setError("");
      setToast("Published — shoppers now see these changes.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't publish."); setSave("error"); }
    setPublishing(false);
  }

  function discard() {
    if (!confirm("Throw away all unpublished changes and go back to what's live?")) return;
    setConfig(JSON.parse(live) as T);
    setToast("Changes discarded.");
  }

  const unpublished = serverDraft !== live;
  const dirty = JSON.stringify(config) !== sent.current;
  return { config, setConfig, problem, save, error, version, setVersion, publishing, publish, discard, unpublished, dirty, toast, setToast };
}

export function EditorToolbar({ ed, device, setDevice, openUrl }: {
  ed: Pick<ReturnType<typeof useDraftEditor<unknown>>, "problem" | "save" | "error" | "unpublished" | "dirty" | "publishing" | "publish" | "discard" | "setVersion">; device: "mobile" | "desktop"; setDevice: (d: "mobile" | "desktop") => void; openUrl: string;
}) {
  const problem = ed.problem;
  const status = problem
    ? <span className="inline-flex items-center gap-1.5 text-amber-600"><CircleAlert className="h-3.5 w-3.5 shrink-0" />{problem}</span>
    : ed.save === "saving" ? <span className="inline-flex items-center gap-1.5 text-admin-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving draft…</span>
    : ed.save === "error" ? <span className="inline-flex items-center gap-1.5 text-red-600"><CircleAlert className="h-3.5 w-3.5 shrink-0" />{ed.error}</span>
    : ed.unpublished ? <span className="inline-flex items-center gap-1.5 text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />Unpublished changes</span>
    : <span className="inline-flex items-center gap-1.5 text-emerald-600"><Check className="h-3.5 w-3.5" />Live — everything published</span>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-admin-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="min-w-0 flex-1 basis-40 text-sm font-medium">{status}</div>
      <div className="flex rounded-lg bg-admin-gray-100 p-1">
        {([["mobile", Smartphone, "Mobile"], ["desktop", Monitor, "Desktop"]] as const).map(([d, Icon, l]) => (
          <button key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold", device === d ? "bg-white text-admin-primary shadow-sm" : "text-admin-gray-500")}>
            <Icon className="h-3.5 w-3.5" />{l}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => ed.setVersion((v) => v + 1)} title="Reload preview" aria-label="Reload preview"
        className="grid h-9 w-9 place-items-center rounded-lg border border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50"><RefreshCw className="h-4 w-4" /></button>
      <a href={openUrl} target="_blank" rel="noreferrer" title="Open preview in a new tab" aria-label="Open preview in a new tab"
        className="grid h-9 w-9 place-items-center rounded-lg border border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50"><ExternalLink className="h-4 w-4" /></a>
      {ed.unpublished && (
        <button type="button" onClick={ed.discard} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-admin-gray-200 px-3 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50">
          <RotateCcw className="h-4 w-4" />Discard
        </button>
      )}
      <button type="button" onClick={ed.publish} disabled={ed.publishing || !!problem || ed.save === "saving" || (!ed.unpublished && !ed.dirty)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-admin-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-admin-primary-dark disabled:cursor-not-allowed disabled:opacity-50">
        {ed.publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Publish
      </button>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return text ? <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-admin-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{text}</div> : null;
}
