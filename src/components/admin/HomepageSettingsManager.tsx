"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2, ArrowUp, ArrowDown, Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlideRow { id: number; image: string; buttonLink: string; status: string; sortOrder: number }
export interface StripItemRow { id: number; categoryId: number; name: string; image: string | null }
export interface SectionRow {
  id: number; sectionType: string; title: string | null; sourceType: string; cardDesign: string;
  productLimit: number; bannerText: string | null; bannerImage: string | null; dismissible: boolean; status: string;
  items: { id: number; label: string; image: string | null }[];
}

interface HomepageSettingsManagerProps {
  slides: SlideRow[];
  stripItems: StripItemRow[];
  stripMode: string;
  stripCount: number;
  sections: SectionRow[];
  categories: { id: number; name: string }[];
  products: { id: number; name: string }[];
}

const TABS = [
  { key: "slider", label: "Slider" },
  { key: "strip", label: "Category Strip" },
  { key: "sections", label: "Sections" },
] as const;

export function HomepageSettingsManager({ slides, stripItems, stripMode, stripCount, sections, categories, products }: HomepageSettingsManagerProps) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("slider");
  const [busy, setBusy] = useState(false);

  async function callAction(fd: FormData) {
    setBusy(true);
    try {
      const res = await fetch("/api/ecommerce/homepage", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) {
        alert(data.message);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function simpleAction(action: string, id: number, extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("action", action);
    fd.set("id", String(id));
    fd.set("return_tab", tab);
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    callAction(fd);
  }

  return (
    <div>
      <div className="flex gap-1.5 border-b border-admin-gray-200 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px", tab === t.key ? "border-admin-primary text-admin-primary" : "border-transparent text-admin-gray-500")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "slider" && (
        <SlidesTab slides={slides} busy={busy} onAdd={callAction} onEdit={callAction} onDelete={(id) => simpleAction("delete_slide", id)} onToggle={(id) => simpleAction("toggle_slide", id)} onMove={(id, dir) => simpleAction("move_slide", id, { direction: dir })} />
      )}
      {tab === "strip" && (
        <StripTab items={stripItems} mode={stripMode} count={stripCount} categories={categories} busy={busy} onAdd={callAction} onSaveSettings={callAction} onDelete={(id) => simpleAction("delete_strip_category", id)} onMove={(id, dir) => simpleAction("move_strip_category", id, { direction: dir })} />
      )}
      {tab === "sections" && (
        <SectionsTab sections={sections} categories={categories} products={products} busy={busy} onAdd={callAction} onAddItem={callAction} onDelete={(id) => simpleAction("delete_section", id)} onToggle={(id) => simpleAction("toggle_section", id)} onMove={(id, dir) => simpleAction("move_section", id, { direction: dir })} onDeleteItem={(id) => simpleAction("delete_section_item", id)} />
      )}
    </div>
  );
}

function SlidesTab({ slides, busy, onAdd, onEdit, onDelete, onToggle, onMove }: {
  slides: SlideRow[]; busy: boolean;
  onAdd: (fd: FormData) => void; onEdit: (fd: FormData) => void;
  onDelete: (id: number) => void; onToggle: (id: number) => void; onMove: (id: number, dir: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<SlideRow | null>(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h5 className="font-bold">Homepage Slider</h5>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-admin-primary text-white text-sm font-medium rounded px-3.5 py-2">
          <Plus className="w-4 h-4" /> Add Slide
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {slides.map((s, i) => (
          <div key={s.id} className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/${s.image}`} alt="" className="w-full h-32 object-cover" />
            <div className="p-3">
              <div className="text-xs text-admin-gray-400 truncate mb-2">{s.buttonLink}</div>
              <div className="flex items-center gap-1.5">
                <button disabled={busy || i === 0} onClick={() => onMove(s.id, "up")} className="w-7 h-7 flex items-center justify-center bg-admin-gray-100 rounded disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                <button disabled={busy || i === slides.length - 1} onClick={() => onMove(s.id, "down")} className="w-7 h-7 flex items-center justify-center bg-admin-gray-100 rounded disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                <button disabled={busy} onClick={() => onToggle(s.id)} className={cn("text-xs font-semibold rounded px-2 py-1", s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-admin-gray-200 text-admin-gray-600")}>{s.status === "active" ? "Active" : "Hidden"}</button>
                <button onClick={() => setEditing(s)} className="w-7 h-7 flex items-center justify-center bg-admin-primary-lighter text-admin-primary rounded ml-auto"><Pencil className="w-3 h-3" /></button>
                <button disabled={busy} onClick={() => onDelete(s.id)} className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <SlideFormModal title="Add Slide" onClose={() => setShowAdd(false)} onSubmit={(fd) => { fd.set("action", "add_slide"); fd.set("return_tab", "slider"); onAdd(fd); setShowAdd(false); }} />
      )}
      {editing && (
        <SlideFormModal title="Edit Slide" initialLink={editing.buttonLink} onClose={() => setEditing(null)} onSubmit={(fd) => { fd.set("action", "edit_slide"); fd.set("id", String(editing.id)); fd.set("return_tab", "slider"); onEdit(fd); setEditing(null); }} />
      )}
    </div>
  );
}

function SlideFormModal({ title, initialLink, onClose, onSubmit }: { title: string; initialLink?: string; onClose: () => void; onSubmit: (fd: FormData) => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }}
        className="bg-white rounded-lg max-w-sm w-full p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h5 className="font-bold text-lg">{title}</h5>
        <div>
          <label className="block text-xs font-medium mb-1">Image {!initialLink && "*"}</label>
          <input type="file" name="image" accept="image/*" required={!initialLink} className="w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Button Link</label>
          <input name="button_link" defaultValue={initialLink ?? "#"} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded bg-admin-gray-100">Cancel</button>
          <button type="submit" className="px-4 py-2 text-sm rounded bg-admin-primary text-white">Save</button>
        </div>
      </form>
    </div>
  );
}

function StripTab({ items, mode, count, categories, busy, onAdd, onSaveSettings, onDelete, onMove }: {
  items: StripItemRow[]; mode: string; count: number; categories: { id: number; name: string }[]; busy: boolean;
  onAdd: (fd: FormData) => void; onSaveSettings: (fd: FormData) => void; onDelete: (id: number) => void; onMove: (id: number, dir: string) => void;
}) {
  const [categoryId, setCategoryId] = useState("");

  return (
    <div>
      <div className="bg-white rounded-lg border border-admin-gray-200 p-4 mb-4">
        <h5 className="font-bold mb-3">Strip Settings</h5>
        <form
          onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("action", "save_strip_settings"); fd.set("return_tab", "strip"); onSaveSettings(fd); }}
          className="flex items-end gap-3 flex-wrap"
        >
          <div>
            <label className="block text-xs font-medium mb-1">Mode</label>
            <select name="strip_mode" defaultValue={mode} className="border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="pinned">Pinned categories only</option>
              <option value="all">Show all categories</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Count (if &quot;all&quot;)</label>
            <input type="number" name="strip_count" min={1} max={30} defaultValue={count} className="w-24 border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="bg-admin-primary text-white text-sm font-medium rounded px-4 py-2">Save</button>
        </form>
      </div>

      <div className="flex items-end gap-2 mb-3">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="border border-admin-gray-200 rounded px-3 py-2 text-sm flex-1">
          <option value="">Pin a category to the strip…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          disabled={!categoryId}
          onClick={() => { const fd = new FormData(); fd.set("action", "add_strip_category"); fd.set("category_id", categoryId); fd.set("return_tab", "strip"); onAdd(fd); setCategoryId(""); }}
          className="bg-admin-primary text-white text-sm font-medium rounded px-4 py-2 disabled:opacity-60"
        >
          Pin
        </button>
      </div>

      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-3 bg-white border border-admin-gray-200 rounded-lg p-2.5">
            {it.image && <img src={`/${it.image}`} alt="" className="w-10 h-10 object-cover rounded" />}
            <span className="text-sm font-medium flex-1">{it.name}</span>
            <button disabled={busy || i === 0} onClick={() => onMove(it.id, "up")} className="w-7 h-7 flex items-center justify-center bg-admin-gray-100 rounded disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
            <button disabled={busy || i === items.length - 1} onClick={() => onMove(it.id, "down")} className="w-7 h-7 flex items-center justify-center bg-admin-gray-100 rounded disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
            <button disabled={busy} onClick={() => onDelete(it.id)} className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionsTab({ sections, categories, products, busy, onAdd, onAddItem, onDelete, onToggle, onMove, onDeleteItem }: {
  sections: SectionRow[]; categories: { id: number; name: string }[]; products: { id: number; name: string }[]; busy: boolean;
  onAdd: (fd: FormData) => void; onAddItem: (fd: FormData) => void;
  onDelete: (id: number) => void; onToggle: (id: number) => void; onMove: (id: number, dir: string) => void; onDeleteItem: (id: number) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addItemFor, setAddItemFor] = useState<number | null>(null);
  const [newSectionType, setNewSectionType] = useState("category_row");

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h5 className="font-bold">Homepage Sections</h5>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-admin-primary text-white text-sm font-medium rounded px-3.5 py-2">
          <Plus className="w-4 h-4" /> Add Section
        </button>
      </div>

      <div className="space-y-3">
        {sections.map((s, i) => (
          <div key={s.id} className="bg-white rounded-lg border border-admin-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-semibold">{s.title || `(untitled ${s.sectionType})`}</span>
                <span className="ml-2 text-xs bg-admin-gray-100 rounded px-2 py-0.5">{s.sectionType}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button disabled={busy || i === 0} onClick={() => onMove(s.id, "up")} className="w-7 h-7 flex items-center justify-center bg-admin-gray-100 rounded disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                <button disabled={busy || i === sections.length - 1} onClick={() => onMove(s.id, "down")} className="w-7 h-7 flex items-center justify-center bg-admin-gray-100 rounded disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                <button disabled={busy} onClick={() => onToggle(s.id)} className={cn("text-xs font-semibold rounded px-2 py-1", s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-admin-gray-200 text-admin-gray-600")}>{s.status === "active" ? "Active" : "Hidden"}</button>
                <button disabled={busy} onClick={() => onDelete(s.id)} className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-600 rounded"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>

            {s.sectionType === "festive_banner" && s.bannerImage && (
              <img src={`/${s.bannerImage}`} alt="" className="w-full h-20 object-cover rounded mb-2" />
            )}
            {s.sectionType === "manual_products" && (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  {s.items.map((it) => (
                    <span key={it.id} className="flex items-center gap-1 bg-admin-gray-100 text-xs rounded-full px-2.5 py-1">
                      {it.label}
                      <button onClick={() => onDeleteItem(it.id)} className="text-red-500">×</button>
                    </span>
                  ))}
                </div>
                <button onClick={() => setAddItemFor(s.id)} className="text-xs text-admin-primary font-medium">+ Add card</button>
              </>
            )}
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setShowAdd(false)}>
          <form
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("action", "add_section"); fd.set("return_tab", "sections"); onAdd(fd); setShowAdd(false); }}
            className="bg-white rounded-lg max-w-md w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h5 className="font-bold text-lg">Add Section</h5>
            <div>
              <label className="block text-xs font-medium mb-1">Section Type</label>
              <select name="section_type" value={newSectionType} onChange={(e) => setNewSectionType(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                <option value="category_row">Category Row</option>
                <option value="product_grid">Product Grid</option>
                <option value="festive_banner">Festive Banner</option>
                <option value="manual_products">Manual Products</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Title</label>
              <input name="title" className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
            </div>
            {newSectionType !== "festive_banner" && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1">Source</label>
                  <select name="source_type" className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                    <option value="latest">Latest Products</option>
                    <option value="category">By Category</option>
                    <option value="manual">Manual Selection</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Category (if by category)</label>
                  <select name="category_id" className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Product Limit</label>
                  <input type="number" name="product_limit" defaultValue={10} min={1} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Card Design</label>
                  <select name="card_design" className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                    <option value="design1">Design 1</option>
                    <option value="design2">Design 2</option>
                    <option value="design3">Design 3</option>
                    <option value="design4">Design 4</option>
                  </select>
                </div>
              </>
            )}
            {newSectionType === "festive_banner" && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1">Banner Text</label>
                  <input name="banner_text" className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Banner Image</label>
                  <input type="file" name="banner_image" accept="image/*" className="w-full text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="dismissible" className="accent-admin-primary" /> Dismissible by visitor
                </label>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded bg-admin-gray-100">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm rounded bg-admin-primary text-white">Add</button>
            </div>
          </form>
        </div>
      )}

      {addItemFor !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setAddItemFor(null)}>
          <form
            onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("action", "add_section_item"); fd.set("section_id", String(addItemFor)); fd.set("return_tab", "sections"); onAddItem(fd); setAddItemFor(null); }}
            className="bg-white rounded-lg max-w-sm w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h5 className="font-bold text-lg">Add Card</h5>
            <div>
              <label className="block text-xs font-medium mb-1">Product</label>
              <select name="product_id" className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                <option value="">—</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Or Custom Label</label>
              <input name="custom_label" className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Or Custom Image</label>
              <input type="file" name="custom_image" accept="image/*" className="w-full text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAddItemFor(null)} className="px-4 py-2 text-sm rounded bg-admin-gray-100">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm rounded bg-admin-primary text-white">Add</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
