"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Undo2, Redo2, Monitor, Smartphone, ExternalLink, CheckCircle2, AlertCircle, X, Loader2, GripVertical,
  Eye, EyeOff, Copy, Trash2, Plus, ImageIcon, LayoutGrid, Flame, Star, Gift, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────────────────────── data shapes (from the server) ───────────────────────── */

export interface Slide2 { id: number; image: string; buttonLink: string; status: string }
export interface StripItem2 { id: number; categoryId: number; name: string; image: string | null }
export interface SectionItem2 { id: number; label: string; image: string | null }
export interface Section2 {
  id: number; sectionType: string; title: string | null; categoryId: number | null;
  sourceType: string; cardDesign: string; productLimit: number;
  bannerText: string | null; bannerImage: string | null; dismissible: boolean; status: string;
  items: SectionItem2[];
}
interface Option { id: number; name: string }

const SECTION_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  category_row: { label: "Category Row", icon: LayoutGrid },
  product_grid: { label: "Product Grid", icon: Star },
  manual_products: { label: "Trending Section", icon: Flame },
  festive_banner: { label: "Festive Banner", icon: Gift },
};
const PALETTE: { type: string; label: string; blurb: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "product_grid", label: "Product Grid", blurb: "Showcase best-selling products", icon: Star },
  { type: "manual_products", label: "Trending Section", blurb: "Highlight trending products or picks", icon: Flame },
  { type: "category_row", label: "Category Sections", blurb: "Grid or list of category collections", icon: LayoutGrid },
  { type: "festive_banner", label: "Festive Banner", blurb: "Promote offers and festive campaigns", icon: Gift },
];

type BlockRef = { kind: "hero" } | { kind: "strip" } | { kind: "section"; id: number };
const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";

/* ───────────────────────── small fetch helpers ───────────────────────── */

async function callAction(payload: Record<string, unknown>): Promise<{ success: boolean; message?: string; id?: number; image?: string }> {
  return fetch("/api/ecommerce/homepage2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then((r) => r.json()).catch(() => ({ success: false, message: "Network error." }));
}
async function callActionForm(form: FormData): Promise<{ success: boolean; message?: string; id?: number; image?: string }> {
  return fetch("/api/ecommerce/homepage2", { method: "POST", body: form }).then((r) => r.json()).catch(() => ({ success: false, message: "Network error." }));
}

/* ───────────────────────── main component ───────────────────────── */

interface Props {
  slides: Slide2[]; stripItems: StripItem2[]; stripMode: string; stripCount: number;
  sections: Section2[]; categories: Option[]; products: Option[];
}

export function HomepageBuilder2({ slides: initialSlides, stripItems: initialStrip, stripMode: initialMode, stripCount: initialCount, sections: initialSections, categories, products }: Props) {
  const router = useRouter();
  const [slides, setSlides] = useState(initialSlides);
  const [stripItems, setStripItems] = useState(initialStrip);
  const [stripMode, setStripMode] = useState(initialMode);
  const [stripCount, setStripCount] = useState(initialCount);
  const [sections, setSections] = useState(initialSections);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [selected, setSelected] = useState<BlockRef>({ kind: "hero" });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const notify = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 3500); };

  // Undo/redo — scoped to SECTION ORDER only (the thing drag-and-drop changes).
  // Field edits (titles, images, toggles) save straight to the server as you
  // make them — like every other "2" page — so there's nothing to "undo" there
  // that isn't already a fresh save away.
  const [history, setHistory] = useState<number[][]>([initialSections.map((s) => s.id)]);
  const [histIndex, setHistIndex] = useState(0);

  const persistOrder = useCallback(async (ids: number[]) => {
    setSaving(true);
    const res = await callAction({ action: "reorder_sections", ids });
    setSaving(false);
    if (res.success) setSavedAt(new Date());
    else notify(false, "Couldn't save the new order.");
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyOrder(ids: number[], pushHistory: boolean) {
    setSections((list) => ids.map((id) => list.find((s) => s.id === id)!).filter(Boolean));
    if (pushHistory) {
      const next = history.slice(0, histIndex + 1);
      next.push(ids);
      setHistory(next);
      setHistIndex(next.length - 1);
    }
    persistOrder(ids);
  }
  function undo() { if (histIndex === 0) return; const i = histIndex - 1; setHistIndex(i); applyOrder(history[i], false); }
  function redo() { if (histIndex >= history.length - 1) return; const i = histIndex + 1; setHistIndex(i); applyOrder(history[i], false); }

  // Native HTML5 drag-and-drop — no extra library, consistent with this
  // project's "hand-rolled over a new dependency" convention elsewhere.
  const dragId = useRef<number | null>(null);
  function onDragStart(id: number) { dragId.current = id; }
  function onDrop(overId: number) {
    if (dragId.current === null || dragId.current === overId) return;
    const ids = sections.map((s) => s.id);
    const from = ids.indexOf(dragId.current);
    const to = ids.indexOf(overId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    dragId.current = null;
    applyOrder(ids, true);
  }

  async function refreshSelectionAfterEdit() { router.refresh(); }

  return (
    <div className="mt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={undo} disabled={histIndex === 0} className="flex h-10 items-center gap-1.5 rounded-[0.5rem] border border-[#dee2e6] bg-white px-3 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50 disabled:opacity-40">
            <Undo2 className="h-4 w-4" /> Undo
          </button>
          <button type="button" onClick={redo} disabled={histIndex >= history.length - 1} className="flex h-10 items-center gap-1.5 rounded-[0.5rem] border border-[#dee2e6] bg-white px-3 text-sm font-medium text-admin-gray-700 hover:bg-admin-gray-50 disabled:opacity-40">
            <Redo2 className="h-4 w-4" /> Redo
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-[0.5rem] border border-[#dee2e6] p-1">
          <button type="button" onClick={() => setDevice("desktop")} className={cn("flex h-9 items-center gap-1.5 rounded-[0.375rem] px-3 text-sm font-medium", device === "desktop" ? "bg-[#2563eb] text-white" : "text-admin-gray-700 hover:bg-admin-gray-50")}><Monitor className="h-4 w-4" /> Desktop</button>
          <button type="button" onClick={() => setDevice("mobile")} className={cn("flex h-9 items-center gap-1.5 rounded-[0.375rem] px-3 text-sm font-medium", device === "mobile" ? "bg-[#2563eb] text-white" : "text-admin-gray-700 hover:bg-admin-gray-50")}><Smartphone className="h-4 w-4" /> Mobile</button>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-admin-gray-500">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : savedAt ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Autosaved {savedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</> : null}
          </span>
          <a href="/shop" target="_blank" rel="noopener noreferrer" className="flex h-10 items-center gap-2 rounded-[0.5rem] border border-[#dee2e6] bg-white px-3.5 text-sm font-medium text-[#374151] hover:bg-[#f9fafb]">
            <ExternalLink className="h-4 w-4" /> Preview Homepage
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_1fr_360px]">
        <Palette onAdd={async (type) => {
          const res = await callAction({ action: "add_section", section_type: type, source_type: "latest", card_design: "design1", product_limit: 10 });
          if (res.success && res.id) { notify(true, "Section added — fill in its details on the right."); setSelected({ kind: "section", id: res.id }); router.refresh(); }
          else notify(false, res.message ?? "Couldn't add that section.");
        }} />

        <div className={cn("mx-auto w-full space-y-3", device === "mobile" && "max-w-[420px]")}>
          <HeroCard slides={slides} selected={selected.kind === "hero"} onSelect={() => setSelected({ kind: "hero" })} />
          <StripCard items={stripItems} selected={selected.kind === "strip"} onSelect={() => setSelected({ kind: "strip" })} />
          {sections.map((s) => (
            <SectionCard key={s.id} section={s} device={device}
              selected={selected.kind === "section" && selected.id === s.id}
              onSelect={() => setSelected({ kind: "section", id: s.id })}
              onDragStart={() => onDragStart(s.id)} onDrop={() => onDrop(s.id)}
              onToggle={async () => { await callAction({ action: "toggle_section", id: s.id }); setSections((l) => l.map((x) => (x.id === s.id ? { ...x, status: x.status === "active" ? "inactive" : "active" } : x))); router.refresh(); }}
              onDuplicate={async () => {
                const res = await callAction({ action: "add_section", section_type: s.sectionType, title: s.title ? `${s.title} (Copy)` : "", source_type: s.sourceType, card_design: s.cardDesign, product_limit: s.productLimit, banner_text: s.bannerText ?? "", category_id: s.categoryId ?? "" });
                if (res.success) { notify(true, "Section duplicated."); router.refresh(); } else notify(false, res.message ?? "Couldn't duplicate.");
              }}
              onDelete={async () => {
                if (!confirm("Delete this section? This can't be undone.")) return;
                const res = await callAction({ action: "delete_section", id: s.id });
                if (res.success) { setSections((l) => l.filter((x) => x.id !== s.id)); if (selected.kind === "section" && selected.id === s.id) setSelected({ kind: "hero" }); notify(true, "Section deleted."); router.refresh(); }
                else notify(false, res.message ?? "Couldn't delete this section.");
              }}
            />
          ))}
          {sections.length === 0 && (
            <div className={cn(CARD, "p-10 text-center text-sm text-admin-gray-400")}>No sections yet — add one from the left panel.</div>
          )}
        </div>

        <SettingsPanel
          selected={selected} slides={slides} stripItems={stripItems} stripMode={stripMode} stripCount={stripCount}
          sections={sections} categories={categories} products={products}
          setSlides={setSlides} setStripItems={setStripItems} setStripMode={setStripMode} setStripCount={setStripCount} setSections={setSections}
          onClose={() => setSelected({ kind: "hero" })} notify={notify} refresh={refreshSelectionAfterEdit}
        />
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

/* ───────────────────────── left palette ───────────────────────── */

function Palette({ onAdd }: { onAdd: (type: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <aside className={cn(CARD, "h-fit space-y-3 p-4")}>
      <div>
        <h3 className="font-bold text-admin-gray-900">Add Sections</h3>
        <p className="text-xs text-admin-gray-500">Click Add to append a section, then edit it on the right.</p>
      </div>
      {PALETTE.map((p) => {
        const Icon = p.icon;
        return (
          <div key={p.type} className="flex items-center gap-3 rounded-[0.5rem] border border-admin-gray-100 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.5rem] bg-admin-gray-50 text-admin-gray-500"><Icon className="h-4.5 w-4.5" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-admin-gray-900">{p.label}</div>
              <div className="text-xs text-admin-gray-500">{p.blurb}</div>
            </div>
            <button type="button" disabled={busy === p.type} onClick={async () => { setBusy(p.type); await onAdd(p.type); setBusy(null); }}
              className="flex h-8 shrink-0 items-center gap-1 rounded-[0.375rem] border border-[#93c5fd] px-2.5 text-xs font-semibold text-[#2563eb] hover:bg-blue-50 disabled:opacity-50">
              {busy === p.type ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
            </button>
          </div>
        );
      })}
    </aside>
  );
}

/* ───────────────────────── canvas cards ───────────────────────── */

function img(src: string | null) {
  if (!src) return null;
  return src.startsWith("http") || src.startsWith("blob:") ? src : `/${src}`;
}

function CardShell({ selected, onSelect, fixed, children, onDragStart, onDrop, label }: {
  selected: boolean; onSelect: () => void; fixed?: boolean; children: React.ReactNode;
  onDragStart?: () => void; onDrop?: () => void; label: string;
}) {
  return (
    <div
      draggable={!fixed}
      onDragStart={onDragStart}
      onDragOver={(e) => !fixed && e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${label}`}
      className={cn(CARD, "cursor-pointer overflow-hidden transition-shadow", selected ? "ring-2 ring-[#2563eb]" : "hover:shadow-md")}
    >
      <div className="flex items-center gap-2 border-b border-admin-gray-100 bg-[#f8f9fa] px-3 py-2">
        {fixed ? <span className="h-4 w-4 shrink-0" /> : <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-admin-gray-400" />}
        <span className="flex-1 truncate text-xs font-semibold text-admin-gray-600">{label}</span>
        {fixed && <span className="rounded-full bg-admin-gray-100 px-2 py-0.5 text-[10px] font-medium text-admin-gray-500">Fixed position</span>}
      </div>
      {children}
    </div>
  );
}

function HeroCard({ slides, selected, onSelect }: { slides: Slide2[]; selected: boolean; onSelect: () => void }) {
  const active = slides.filter((s) => s.status === "active");
  const first = active[0] ?? slides[0];
  return (
    <CardShell selected={selected} onSelect={onSelect} fixed label={`Hero Banner (Banner Slider) — ${slides.length} slide${slides.length === 1 ? "" : "s"}`}>
      <div className="relative h-40 w-full bg-admin-gray-100">
        {first?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(first.image)!} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-admin-gray-300"><ImageIcon className="h-8 w-8" /></div>
        )}
        {active.length > 1 && (
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {active.map((_, i) => <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i === 0 ? "bg-white" : "bg-white/50")} />)}
          </div>
        )}
      </div>
    </CardShell>
  );
}

function StripCard({ items, selected, onSelect }: { items: StripItem2[]; selected: boolean; onSelect: () => void }) {
  return (
    <CardShell selected={selected} onSelect={onSelect} fixed label={`Shop by Category — ${items.length} categor${items.length === 1 ? "y" : "ies"}`}>
      <div className="flex gap-3 overflow-x-auto p-3">
        {items.length === 0 ? (
          <p className="py-4 text-sm text-admin-gray-400">No categories pinned yet.</p>
        ) : items.slice(0, 8).map((it) => (
          <div key={it.id} className="flex shrink-0 flex-col items-center gap-1.5">
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-admin-gray-50">
              {it.image ? <img src={img(it.image)!} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-admin-gray-300" />}
            </span>
            <span className="max-w-[64px] truncate text-[11px] text-admin-gray-600">{it.name}</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function SectionCard({ section: s, device, selected, onSelect, onDragStart, onDrop, onToggle, onDuplicate, onDelete }: {
  section: Section2; device: "desktop" | "mobile"; selected: boolean; onSelect: () => void;
  onDragStart: () => void; onDrop: () => void; onToggle: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const meta = SECTION_META[s.sectionType] ?? SECTION_META.category_row;
  const title = s.title || meta.label;
  return (
    <div className="group relative">
      <CardShell selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDrop={onDrop} label={title}>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-bold text-admin-gray-900">{title}</h4>
            <span className="text-xs font-medium text-[#2563eb]">View all</span>
          </div>
          {s.sectionType === "festive_banner" ? (
            <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-[0.5rem] bg-gradient-to-br from-[#fdf3e3] to-[#fffaf0]">
              {s.bannerImage && <img src={img(s.bannerImage)!} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              <span className="relative text-sm font-semibold text-admin-gray-800">{s.bannerText || "Festive Offer"}</span>
            </div>
          ) : (
            <div className={cn("grid gap-3", device === "mobile" ? "grid-cols-2" : "grid-cols-4")}>
              {(s.items.length > 0
                ? s.items.slice(0, device === "mobile" ? 2 : 4)
                : Array.from({ length: device === "mobile" ? 2 : 4 }, (): SectionItem2 | null => null)
              ).map((it, i) => (
                <div key={it?.id ?? i} className="rounded-[0.375rem] border border-admin-gray-100 p-2 text-center">
                  <div className="mb-1.5 flex h-14 items-center justify-center overflow-hidden rounded bg-admin-gray-50">
                    {it?.image ? <img src={img(it.image)!} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-admin-gray-300" />}
                  </div>
                  <div className="truncate text-[11px] text-admin-gray-600">{it ? it.label : s.sourceType === "latest" ? "Latest product" : "Product"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardShell>
      <div className="pointer-events-none absolute right-3 top-11 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <IconBtn title={s.status === "active" ? "Hide" : "Show"} onClick={onToggle}>{s.status === "active" ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</IconBtn>
        <IconBtn title="Duplicate" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="Delete" danger onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
      </div>
      {s.status !== "active" && <span className="absolute left-3 top-11 rounded-full bg-admin-gray-800/80 px-2 py-0.5 text-[10px] font-semibold text-white">Hidden</span>}
    </div>
  );
}

function IconBtn({ title, danger, onClick, children }: { title: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn("flex h-7 w-7 items-center justify-center rounded-[0.375rem] border bg-white shadow-sm", danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50")}>
      {children}
    </button>
  );
}

/* ───────────────────────── right settings panel ───────────────────────── */

const inputCls = "h-10 w-full rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15";
const labelCls = "mb-1.5 block text-sm font-medium text-admin-gray-900";

interface PanelProps {
  selected: BlockRef;
  slides: Slide2[]; stripItems: StripItem2[]; stripMode: string; stripCount: number; sections: Section2[];
  categories: Option[]; products: Option[];
  setSlides: React.Dispatch<React.SetStateAction<Slide2[]>>;
  setStripItems: React.Dispatch<React.SetStateAction<StripItem2[]>>;
  setStripMode: React.Dispatch<React.SetStateAction<string>>;
  setStripCount: React.Dispatch<React.SetStateAction<number>>;
  setSections: React.Dispatch<React.SetStateAction<Section2[]>>;
  onClose: () => void;
  notify: (ok: boolean, text: string) => void;
  refresh: () => void;
}

function SettingsPanel(props: PanelProps) {
  const { selected, onClose } = props;
  return (
    <aside className={cn(CARD, "h-fit p-5")}>
      <div className="mb-4 flex items-center justify-between border-b border-admin-gray-100 pb-3">
        <h3 className="text-base font-bold text-admin-gray-900">Section Settings</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-admin-gray-500 hover:bg-admin-gray-100"><X className="h-4 w-4" /></button>
      </div>
      {selected.kind === "hero" && <HeroEditor {...props} />}
      {selected.kind === "strip" && <StripEditor {...props} />}
      {selected.kind === "section" && <SectionEditor {...props} sectionId={selected.id} />}
    </aside>
  );
}

function HeroEditor({ slides, setSlides, notify, refresh }: PanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<Set<number>>(new Set());

  async function addSlide(file: File) {
    setUploading(true);
    const form = new FormData();
    form.set("action", "add_slide");
    form.set("image", file);
    form.set("button_link", "/shop");
    const res = await callActionForm(form);
    setUploading(false);
    if (res.success && res.id && res.image) { setSlides((l) => [...l, { id: res.id!, image: res.image!, buttonLink: "/shop", status: "active" }]); notify(true, "Slide added."); refresh(); }
    else notify(false, res.message ?? "Couldn't add that slide.");
  }
  async function removeSlide(id: number) {
    if (!confirm("Delete this slide?")) return;
    setBusy((s) => new Set(s).add(id));
    const res = await callAction({ action: "delete_slide", id });
    setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    if (res.success) { setSlides((l) => l.filter((s) => s.id !== id)); notify(true, "Slide deleted."); refresh(); }
    else notify(false, res.message ?? "Couldn't delete this slide.");
  }
  async function toggleSlide(id: number) {
    setBusy((s) => new Set(s).add(id));
    await callAction({ action: "toggle_slide", id });
    setSlides((l) => l.map((s) => (s.id === id ? { ...s, status: s.status === "active" ? "inactive" : "active" } : s)));
    setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    refresh();
  }
  async function editLink(id: number, buttonLink: string) {
    await callAction({ action: "edit_slide", id, button_link: buttonLink });
    setSlides((l) => l.map((s) => (s.id === id ? { ...s, buttonLink } : s)));
    refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs font-semibold uppercase text-admin-gray-400">Selected Section</span>
        <p className="font-semibold text-admin-gray-900">Hero Banner (Banner Slider)</p>
      </div>
      <div>
        <label className={labelCls}>Banner Slides</label>
        <div className="space-y-3">
          {slides.map((s) => (
            <div key={s.id} className={cn("flex items-center gap-3 rounded-[0.5rem] border border-admin-gray-100 p-2.5", busy.has(s.id) && "opacity-60")}>
              <span className="h-14 w-20 shrink-0 overflow-hidden rounded-[0.375rem] bg-admin-gray-50">
                <img src={img(s.image)!} alt="" className="h-full w-full object-cover" />
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <input defaultValue={s.buttonLink} onBlur={(e) => editLink(s.id, e.target.value || "#")} placeholder="Button link" className="h-8 w-full rounded-[0.375rem] border border-admin-gray-200 px-2 text-xs" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleSlide(s.id)} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", s.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-admin-gray-100 text-admin-gray-500")}>{s.status === "active" ? "Active" : "Hidden"}</button>
                  <button type="button" onClick={() => removeSlide(s.id)} className="text-[10px] font-medium text-red-600 hover:underline">Remove</button>
                </div>
              </div>
            </div>
          ))}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) addSlide(f); e.target.value = ""; }} />
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[0.375rem] border-2 border-dashed border-admin-gray-200 text-sm font-medium text-admin-gray-500 hover:border-[#2563eb] hover:text-[#2563eb] disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Add Slide
          </button>
        </div>
        <p className="mt-1.5 text-xs text-admin-gray-400">Minimum size: 1920×700px</p>
      </div>
    </div>
  );
}

function StripEditor({ stripItems, setStripItems, stripMode, setStripMode, stripCount, setStripCount, categories, notify, refresh }: PanelProps) {
  const [addingId, setAddingId] = useState("");
  const [busy, setBusy] = useState(false);
  const available = categories.filter((c) => !stripItems.some((s) => s.categoryId === c.id));

  async function saveSettings(mode: string, count: number) {
    setBusy(true);
    await callAction({ action: "save_strip_settings", strip_mode: mode, strip_count: count });
    setBusy(false);
    refresh();
  }
  async function addCategory() {
    if (!addingId) return;
    const res = await callAction({ action: "add_strip_category", category_id: addingId });
    if (res.success && res.id) {
      const cat = categories.find((c) => c.id === Number(addingId))!;
      setStripItems((l) => [...l, { id: res.id!, categoryId: cat.id, name: cat.name, image: null }]);
      setAddingId("");
      notify(true, "Category added to strip.");
      refresh();
    } else notify(false, res.message ?? "Couldn't add that category.");
  }
  async function removeCategory(id: number) {
    const res = await callAction({ action: "delete_strip_category", id });
    if (res.success) { setStripItems((l) => l.filter((s) => s.id !== id)); refresh(); }
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs font-semibold uppercase text-admin-gray-400">Selected Section</span>
        <p className="font-semibold text-admin-gray-900">Shop by Category</p>
      </div>
      <div>
        <label className={labelCls}>Display Mode</label>
        <div className="grid grid-cols-2 gap-2">
          {[{ v: "pinned", l: "Pinned list" }, { v: "all", l: "All categories" }].map((o) => (
            <button key={o.v} type="button" onClick={() => { setStripMode(o.v); saveSettings(o.v, stripCount); }}
              className={cn("h-9 rounded-[0.375rem] border text-sm font-medium", stripMode === o.v ? "border-[#2563eb] bg-blue-50 text-[#2563eb]" : "border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50")}>
              {o.l}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelCls}>Max Categories Shown</label>
        <input type="number" min={1} max={30} value={stripCount} disabled={busy}
          onChange={(e) => setStripCount(Number(e.target.value))} onBlur={(e) => saveSettings(stripMode, Number(e.target.value) || 10)} className={inputCls} />
      </div>
      {stripMode === "pinned" && (
        <div>
          <label className={labelCls}>Pinned Categories</label>
          <div className="mb-2 flex gap-2">
            <select value={addingId} onChange={(e) => setAddingId(e.target.value)} className={inputCls}>
              <option value="">Select a category…</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" onClick={addCategory} disabled={!addingId} className="flex h-10 shrink-0 items-center gap-1 rounded-[0.375rem] bg-[#2563eb] px-3 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="space-y-1.5">
            {stripItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between rounded-[0.375rem] border border-admin-gray-100 px-3 py-1.5 text-sm">
                <span className="text-admin-gray-800">{it.name}</span>
                <button type="button" onClick={() => removeCategory(it.id)} className="text-xs font-medium text-red-600 hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionEditor({ sections, setSections, categories, products, notify, refresh, sectionId }: PanelProps & { sectionId: number }) {
  const s = sections.find((x) => x.id === sectionId);
  const [saving, setSaving] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  if (!s) return <p className="text-sm text-admin-gray-400">This section was removed.</p>;

  function patch(next: Partial<Section2>) { setSections((l) => l.map((x) => (x.id === s!.id ? { ...x, ...next } : x))); }

  async function save() {
    setSaving(true);
    const form = new FormData();
    form.set("action", "edit_section");
    form.set("id", String(s!.id));
    form.set("title", s!.title ?? "");
    form.set("category_id", s!.categoryId ? String(s!.categoryId) : "");
    form.set("source_type", s!.sourceType);
    form.set("card_design", s!.cardDesign);
    form.set("product_limit", String(s!.productLimit));
    form.set("banner_text", s!.bannerText ?? "");
    if (s!.dismissible) form.set("dismissible", "1");
    if (bannerFile) form.set("banner_image", bannerFile);
    const res = await callActionForm(form);
    setSaving(false);
    if (res.success) { notify(true, "Section saved."); setBannerFile(null); refresh(); }
    else notify(false, res.message ?? "Couldn't save this section.");
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs font-semibold uppercase text-admin-gray-400">Selected Section</span>
        <p className="font-semibold text-admin-gray-900">{s.title || SECTION_META[s.sectionType]?.label}</p>
      </div>
      <div>
        <label className={labelCls}>Heading</label>
        <input value={s.title ?? ""} onChange={(e) => patch({ title: e.target.value })} placeholder={SECTION_META[s.sectionType]?.label} className={inputCls} />
      </div>

      {s.sectionType === "festive_banner" ? (
        <>
          <div>
            <label className={labelCls}>Banner Text</label>
            <input value={s.bannerText ?? ""} onChange={(e) => patch({ bannerText: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Banner Image</label>
            <div className="flex items-center gap-3">
              {(bannerFile || s.bannerImage) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerFile ? URL.createObjectURL(bannerFile) : img(s.bannerImage)!} alt="" className="h-14 w-24 rounded-[0.375rem] border border-admin-gray-200 object-cover" />
              )}
              <input ref={bannerRef} type="file" accept="image/*" className="sr-only" onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => bannerRef.current?.click()} className="h-9 rounded-[0.375rem] border border-[#dee2e6] bg-[#f8f9fa] px-3 text-sm font-medium text-admin-gray-800 hover:bg-admin-gray-100">Choose file</button>
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium text-admin-gray-900">
            <input type="checkbox" checked={s.dismissible} onChange={(e) => patch({ dismissible: e.target.checked })} className="h-4 w-4 accent-[#2563eb]" /> Dismissible (shows a close ✕ on the storefront)
          </label>
        </>
      ) : (
        <>
          <div>
            <label className={labelCls}>Source</label>
            <select value={s.sourceType} onChange={(e) => patch({ sourceType: e.target.value })} className={inputCls}>
              <option value="latest">Latest Products</option>
              <option value="category">A Specific Category</option>
              <option value="manual">Manually Picked (see items below)</option>
            </select>
          </div>
          {s.sourceType === "category" && (
            <div>
              <label className={labelCls}>Category</label>
              <select value={s.categoryId ?? ""} onChange={(e) => patch({ categoryId: e.target.value ? Number(e.target.value) : null })} className={inputCls}>
                <option value="">Select a category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {s.sourceType !== "manual" && (
            <div>
              <label className={labelCls}>How Many to Show</label>
              <input type="number" min={1} max={50} value={s.productLimit} onChange={(e) => patch({ productLimit: Number(e.target.value) || 10 })} className={inputCls} />
            </div>
          )}
          <div>
            <label className={labelCls}>Card Design</label>
            <div className="grid grid-cols-4 gap-2">
              {["design1", "design2", "design3", "design4"].map((d) => (
                <button key={d} type="button" onClick={() => patch({ cardDesign: d })}
                  className={cn("h-9 rounded-[0.375rem] border text-xs font-medium", s.cardDesign === d ? "border-[#2563eb] bg-blue-50 text-[#2563eb]" : "border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50")}>
                  {d.replace("design", "D")}
                </button>
              ))}
            </div>
          </div>
          {s.sourceType === "manual" && <ManualItemsEditor section={s} products={products} categories={categories} setSections={setSections} notify={notify} refresh={refresh} />}
        </>
      )}

      <div>
        <label className={labelCls}>Status</label>
        <div className="grid grid-cols-2 gap-2">
          {[{ v: "active", l: "Visible" }, { v: "inactive", l: "Hidden" }].map((o) => (
            <button key={o.v} type="button" onClick={() => patch({ status: o.v })}
              className={cn("h-9 rounded-[0.375rem] border text-sm font-medium", s!.status === o.v ? "border-[#2563eb] bg-blue-50 text-[#2563eb]" : "border-admin-gray-200 text-admin-gray-600 hover:bg-admin-gray-50")}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <button type="button" onClick={save} disabled={saving} className="flex h-10 w-full items-center justify-center gap-2 rounded-[0.5rem] bg-[#2563eb] text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Section
      </button>
    </div>
  );
}

function ManualItemsEditor({ section: s, products, setSections, notify, refresh }: {
  section: Section2; products: Option[]; categories: Option[]; setSections: PanelProps["setSections"]; notify: PanelProps["notify"]; refresh: PanelProps["refresh"];
}) {
  const [productId, setProductId] = useState("");
  async function addItem() {
    if (!productId) return;
    const res = await callAction({ action: "add_section_item", section_id: s.id, product_id: productId });
    if (res.success && res.id) {
      const p = products.find((x) => x.id === Number(productId))!;
      setSections((l) => l.map((x) => (x.id === s.id ? { ...x, items: [...x.items, { id: res.id!, label: p.name, image: null }] } : x)));
      setProductId("");
      notify(true, "Product added.");
      refresh();
    } else notify(false, res.message ?? "Couldn't add that product.");
  }
  async function removeItem(itemId: number) {
    const res = await callAction({ action: "delete_section_item", id: itemId });
    if (res.success) { setSections((l) => l.map((x) => (x.id === s.id ? { ...x, items: x.items.filter((it) => it.id !== itemId) } : x))); refresh(); }
  }
  return (
    <div>
      <label className={labelCls}>Manually Picked Products</label>
      <div className="mb-2 flex gap-2">
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputCls}>
          <option value="">Select a product…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" onClick={addItem} disabled={!productId} className="flex h-10 shrink-0 items-center gap-1 rounded-[0.375rem] bg-[#2563eb] px-3 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"><Plus className="h-4 w-4" /></button>
      </div>
      <div className="space-y-1.5">
        {s.items.length === 0 ? <p className="text-xs text-admin-gray-400">No products picked yet.</p> : s.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-[0.375rem] border border-admin-gray-100 px-3 py-1.5 text-sm">
            <span className="truncate text-admin-gray-800">{it.label}</span>
            <button type="button" onClick={() => removeItem(it.id)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

