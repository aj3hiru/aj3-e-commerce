"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Award, BadgeCheck, BadgePercent, Banknote, Box, Gift, GripVertical, Headphones, Info, Leaf, Palette, Plus, RotateCcw,
  Search, ShieldCheck, Star, Tag, Trash2, Truck,
  Navigation, Images, BadgeInfo, LayoutGrid, FileText, Ruler, Store, ListChecks, MessageSquareText, ShieldPlus, ShoppingCart, Rows3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card, ColorInput, EditorToolbar, IconBtn, ImageField, INPUT, Label, LinkInput, Preview, Segmented, Text, Thumb, Toast, Toggle, rid, useDraftEditor,
  type PickCategory, type PickProduct,
} from "./ui";
import {
  ASSURANCE_ICONS, PP_SECTION_HINT, PP_SECTION_LABEL, TRUST_ICONS,
  type AssuranceIcon, type PPSectionKey, type ProductPageConfig, type TrustIcon,
} from "@/types/product-page";
import { isSafeHref } from "@/types/storefront";

const SECTION_ICON: Record<PPSectionKey, typeof Box> = {
  breadcrumb: Navigation, gallery: Images, trust: BadgeInfo, thumbs: LayoutGrid, info: FileText, sizes: Ruler, soldBy: Store,
  highlights: ListChecks, reviews: MessageSquareText, assurance: ShieldPlus, actions: ShoppingCart, related: Rows3,
};
const TRUST_ICON: Record<TrustIcon, typeof Box> = { check: BadgeCheck, box: Box, star: Star, shield: ShieldCheck, truck: Truck, tag: Tag, award: Award, leaf: Leaf };
const ASSURE_ICON: Record<AssuranceIcon, typeof Box> = { price: BadgePercent, cod: Banknote, returns: RotateCcw, truck: Truck, shield: ShieldCheck, support: Headphones, quality: Award, gift: Gift };
/** Autosave pauses while this returns a message. */
const checkProductPage = (c: ProductPageConfig) =>
  c.soldBy.showViewShop && !isSafeHref(c.soldBy.viewShopUrl) ? "The View Shop link isn't valid." : "";
const ACCENTS = ["#9f2089", "#7c3aed", "#e11d48", "#ea580c", "#16a34a", "#0284c7", "#353543"];

function IconPicker<T extends string>({ value, options, icons, onChange }: { value: T; options: readonly T[]; icons: Record<T, typeof Box>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => { const I: typeof Box = icons[o]; return (
        <button key={o} type="button" onClick={() => onChange(o)} aria-label={o} aria-pressed={value === o} title={o}
          className={cn("grid h-8 w-8 place-items-center rounded-md border transition", value === o ? "border-admin-primary bg-admin-primary-lighter text-admin-primary" : "border-admin-gray-200 text-admin-gray-500 hover:bg-admin-gray-50")}>
          <I className="h-4 w-4" />
        </button>
      ); })}
    </div>
  );
}

function Num({ label, value, onChange, min, max, hint }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; hint?: string }) {
  return (
    <label className="block">
      <Label hint={hint ?? `${min}–${max}`}>{label}</Label>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} className={INPUT} />
    </label>
  );
}

export function ProductPageCustomizer({ initialDraft, initialLive, products, categories }: {
  initialDraft: ProductPageConfig; initialLive: ProductPageConfig; products: (PickProduct & { slug: string })[]; categories: PickCategory[];
}) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [open, setOpen] = useState<string | null>("info");
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [previewSlug, setPreviewSlug] = useState(products[0]?.slug ?? "");
  const [pq, setPq] = useState("");
  const [picking, setPicking] = useState(false);

  const ed = useDraftEditor<ProductPageConfig>(initialDraft, initialLive, "/api/ecommerce/product-page-customizer", checkProductPage);
  const c = ed.config;
  const update = (fn: (c: ProductPageConfig) => ProductPageConfig) => ed.setConfig(fn);
  const setPart = <K extends keyof ProductPageConfig>(k: K, p: Partial<ProductPageConfig[K]>) =>
    update((prev) => ({ ...prev, [k]: typeof prev[k] === "object" && !Array.isArray(prev[k]) ? { ...(prev[k] as object), ...p } : p }));
  const hidden = new Set(c.hidden);
  const setShown = (k: PPSectionKey, on: boolean) => update((prev) => ({ ...prev, hidden: on ? prev.hidden.filter((x) => x !== k) : [...prev.hidden, k] }));
  const move = (from: number, to: number) => update((prev) => {
    if (to < 0 || to >= prev.order.length || from === to) return prev;
    const n = [...prev.order]; const [x] = n.splice(from, 1); n.splice(to, 0, x);
    return { ...prev, order: n };
  });
  function toggle(key: string) {
    const next = open === key ? null : key;
    setOpen(next);
    if (next) setFocus({ id: next, n: Date.now() });
  }

  const picks = useMemo(() => {
    const q = pq.trim().toLowerCase();
    return (q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products).slice(0, 8);
  }, [pq, products]);
  const current = products.find((p) => p.slug === previewSlug);
  const url = previewSlug ? `/product?slug=${encodeURIComponent(previewSlug)}&hc=draft` : "/?hc=draft";

  function editor(k: PPSectionKey) {
    switch (k) {
      case "breadcrumb":
        return <p className="text-xs text-admin-gray-500">Shows <b>Home / Category / Product</b> in your theme colour. Nothing else to set.</p>;
      case "gallery":
        return <div className="divide-y divide-admin-gray-100">
          <Toggle on={c.gallery.dots} onChange={(v) => setPart("gallery", { dots: v })}>Dots under the photos</Toggle>
          <Toggle on={c.gallery.zoom} onChange={(v) => setPart("gallery", { zoom: v })}>Tap a photo to open it full screen</Toggle>
        </div>;
      case "trust":
        return <>
          <div className="grid grid-cols-2 gap-3">
            <Text label="Badge text" value={c.trust.badge} onChange={(v) => setPart("trust", { badge: v })} max={20} placeholder="Assured" hint="Blank = no badge" />
            <ColorInput label="Badge colour" value={c.trust.badgeColor} onChange={(v) => setPart("trust", { badgeColor: v })} />
          </div>
          <ColorInput label="Strip background" value={c.trust.bg} onChange={(v) => setPart("trust", { bg: v })} swatches={["#e8e0fd", "#e7eeff", "#fdecf5", "#e8f7ee", "#f3f3f7"]} />
          <div className="space-y-2">
            <Label hint={`${c.trust.items.length}/3`}>Items</Label>
            {c.trust.items.map((it, i) => (
              <div key={it.id} className="space-y-2 rounded-lg border border-admin-gray-200 p-2.5">
                <div className="flex gap-2">
                  <input value={it.label} maxLength={30} onChange={(e) => setPart("trust", { items: c.trust.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                    placeholder="Original Products" className={cn(INPUT, !it.label.trim() && "border-amber-400")} />
                  <IconBtn label="Remove" danger onClick={() => setPart("trust", { items: c.trust.items.filter((_, j) => j !== i) })}><Trash2 /></IconBtn>
                </div>
                <IconPicker value={it.icon} options={TRUST_ICONS} icons={TRUST_ICON} onChange={(v) => setPart("trust", { items: c.trust.items.map((x, j) => (j === i ? { ...x, icon: v } : x)) })} />
              </div>
            ))}
            {c.trust.items.length < 3 && (
              <button type="button" onClick={() => setPart("trust", { items: [...c.trust.items, { id: rid(), icon: "check", label: "" }] })}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-admin-primary"><Plus className="h-4 w-4" />Add item</button>
            )}
          </div>
        </>;
      case "thumbs":
        return <>
          <Text label="Label above the photos" value={c.thumbs.title} onChange={(v) => setPart("thumbs", { title: v })} max={40} placeholder="Product Photos" hint="Blank = no label" />
          <Toggle on={c.thumbs.showCount} onChange={(v) => setPart("thumbs", { showCount: v })}>Show the number of photos (e.g. &ldquo;4 Product Photos&rdquo;)</Toggle>
          <p className="text-xs text-admin-gray-500">Shown when a product has 2 or more photos. Tapping a thumbnail shows that photo in the gallery.</p>
        </>;
      case "info":
        return <>
          <div className="divide-y divide-admin-gray-100 rounded-lg border border-admin-gray-200 px-2">
            <Toggle on={c.info.showWishlist} onChange={(v) => setPart("info", { showWishlist: v })}>Wishlist button</Toggle>
            <Toggle on={c.info.showShare} onChange={(v) => setPart("info", { showShare: v })}>Share button</Toggle>
            <Toggle on={c.info.showDeal} onChange={(v) => setPart("info", { showDeal: v })}>Deal countdown (live campaigns)</Toggle>
            <Toggle on={c.info.showStock} onChange={(v) => setPart("info", { showStock: v })}>&ldquo;Only a few left&rdquo; / out of stock</Toggle>
            <Toggle on={c.info.showRating} onChange={(v) => setPart("info", { showRating: v })}>Rating pill &amp; counts</Toggle>
            <Toggle on={c.info.showOffer} onChange={(v) => setPart("info", { showOffer: v })}>&ldquo;₹x with N Special Offers&rdquo; (coupons)</Toggle>
          </div>
          {c.info.showOffer && <p className="flex gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800"><Info className="mt-px h-3.5 w-3.5 shrink-0" />Shoppers will see the codes of your active coupons that apply to the product.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Text label="Delivery line" value={c.info.deliveryText} onChange={(v) => setPart("info", { deliveryText: v })} max={40} placeholder="Free Delivery" hint="Blank = hide" />
            <Text label="Struck-out text" value={c.info.deliveryStrike} onChange={(v) => setPart("info", { deliveryStrike: v })} max={20} placeholder="₹70" hint="Optional" />
          </div>
        </>;
      case "sizes":
        return <>
          <Text label="Title" value={c.sizes.title} onChange={(v) => setPart("sizes", { title: v })} max={40} />
          <Toggle on={c.sizes.showPrice} onChange={(v) => setPart("sizes", { showPrice: v })}>Show the price in each chip (when sizes cost differently)</Toggle>
          <p className="text-xs text-admin-gray-500">Only shown for products with Sizes / Units. The chosen size goes into the cart with its own price and stock.</p>
        </>;
      case "soldBy":
        return <>
          <div className="grid grid-cols-2 gap-3">
            <Text label="Title" value={c.soldBy.title} onChange={(v) => setPart("soldBy", { title: v })} max={40} />
            <Text label="Store name" value={c.soldBy.name} onChange={(v) => setPart("soldBy", { name: v })} max={80} placeholder="Business name" hint="Blank = business name" />
          </div>
          <Toggle on={c.soldBy.showRating} onChange={(v) => setPart("soldBy", { showRating: v })}>Store rating (all product reviews)</Toggle>
          <Toggle on={c.soldBy.showViewShop} onChange={(v) => setPart("soldBy", { showViewShop: v })}>View Shop button</Toggle>
          {c.soldBy.showViewShop && <div className="grid grid-cols-2 gap-3">
            <Text label="Button text" value={c.soldBy.viewShopLabel} onChange={(v) => setPart("soldBy", { viewShopLabel: v })} max={24} />
            <LinkInput label="Button link" value={c.soldBy.viewShopUrl} onChange={(v) => setPart("soldBy", { viewShopUrl: v })} categories={categories} />
          </div>}
        </>;
      case "highlights":
        return <>
          <div className="grid grid-cols-2 gap-3">
            <Text label="Title" value={c.highlights.title} onChange={(v) => setPart("highlights", { title: v })} max={40} />
            <Text label="Description heading" value={c.highlights.detailsTitle} onChange={(v) => setPart("highlights", { detailsTitle: v })} max={40} />
          </div>
          <div>
            <Label>Show in the grid (plus the product&rsquo;s Specifications)</Label>
            <div className="divide-y divide-admin-gray-100 rounded-lg border border-admin-gray-200 px-2">
              <Toggle on={c.highlights.showBrand} onChange={(v) => setPart("highlights", { showBrand: v })}>Brand</Toggle>
              <Toggle on={c.highlights.showCategory} onChange={(v) => setPart("highlights", { showCategory: v })}>Category</Toggle>
              <Toggle on={c.highlights.showUnit} onChange={(v) => setPart("highlights", { showUnit: v })}>Unit (Sold by)</Toggle>
              <Toggle on={c.highlights.showSku} onChange={(v) => setPart("highlights", { showSku: v })}>SKU</Toggle>
            </div>
          </div>
          <Toggle on={c.highlights.showCopy} onChange={(v) => setPart("highlights", { showCopy: v })}>COPY button</Toggle>
          <Toggle on={c.highlights.detailsOpen} onChange={(v) => setPart("highlights", { detailsOpen: v })}>Description open by default</Toggle>
        </>;
      case "reviews":
        return <>
          <Text label="Title" value={c.reviews.title} onChange={(v) => setPart("reviews", { title: v })} max={50} />
          <Num label="Reviews shown before “View all”" value={c.reviews.perPage} onChange={(n) => setPart("reviews", { perPage: n })} min={1} max={20} />
          <Toggle on={c.reviews.showBars} onChange={(v) => setPart("reviews", { showBars: v })}>Rating summary with bars</Toggle>
          <Toggle on={c.reviews.allowWrite} onChange={(v) => setPart("reviews", { allowWrite: v })}>&ldquo;Write a review&rdquo; for logged-in shoppers</Toggle>
        </>;
      case "assurance":
        return <>
          <ColorInput label="Background" value={c.assurance.bg} onChange={(v) => setPart("assurance", { bg: v })} swatches={["#e7eeff", "#e8e0fd", "#fdecf5", "#e8f7ee", "#f3f3f7"]} />
          <div className="space-y-2">
            <Label hint={`${c.assurance.items.length}/4`}>Badges</Label>
            {c.assurance.items.map((it, i) => (
              <div key={it.id} className="grid grid-cols-[64px_1fr] gap-2.5 rounded-lg border border-admin-gray-200 p-2.5">
                <ImageField label="" value={it.image} onChange={(v) => setPart("assurance", { items: c.assurance.items.map((x, j) => (j === i ? { ...x, image: v } : x)) })} aspect="aspect-square" />
                <div className="space-y-2">
                  <div className="flex gap-1">
                    <input value={it.label} maxLength={30} placeholder="Cash on Delivery" className={cn(INPUT, !it.label.trim() && "border-amber-400")}
                      onChange={(e) => setPart("assurance", { items: c.assurance.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <IconBtn label="Move up" disabled={i === 0} onClick={() => { const n = [...c.assurance.items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setPart("assurance", { items: n }); }}><ArrowUp /></IconBtn>
                    <IconBtn label="Remove" danger onClick={() => setPart("assurance", { items: c.assurance.items.filter((_, j) => j !== i) })}><Trash2 /></IconBtn>
                  </div>
                  <IconPicker value={it.icon} options={ASSURANCE_ICONS} icons={ASSURE_ICON} onChange={(v) => setPart("assurance", { items: c.assurance.items.map((x, j) => (j === i ? { ...x, icon: v } : x)) })} />
                </div>
              </div>
            ))}
            {c.assurance.items.length < 4 && (
              <button type="button" onClick={() => setPart("assurance", { items: [...c.assurance.items, { id: rid(), icon: "shield", image: "", label: "" }] })}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-admin-primary"><Plus className="h-4 w-4" />Add badge</button>
            )}
            <p className="text-xs text-admin-gray-500">Upload an image to replace the icon. Make sure each promise (COD, returns…) is true for your store.</p>
          </div>
        </>;
      case "actions":
        return <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Toggle on={c.actions.showCart} onChange={(v) => setPart("actions", { showCart: v })}>Add to Cart</Toggle>
              <Text label="Text" value={c.actions.cartLabel} onChange={(v) => setPart("actions", { cartLabel: v })} max={24} /></div>
            <div className="space-y-2"><Toggle on={c.actions.showBuy} onChange={(v) => setPart("actions", { showBuy: v })}>Buy Now</Toggle>
              <Text label="Text" value={c.actions.buyLabel} onChange={(v) => setPart("actions", { buyLabel: v })} max={24} /></div>
          </div>
          <Toggle on={c.actions.sticky} onChange={(v) => setPart("actions", { sticky: v })}>Stick to the bottom until this spot is reached</Toggle>
          <p className="text-xs text-admin-gray-500">Drag this section to choose where the buttons settle — like Meesho, right after the assurance badges.</p>
        </>;
      case "related":
        return <>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Text label="Title" value={c.related.title} onChange={(v) => setPart("related", { title: v })} max={40} />
            <Num label="Products" value={c.related.limit} onChange={(n) => setPart("related", { limit: n })} min={2} max={30} />
          </div>
          <Segmented value={c.related.source} onChange={(v) => setPart("related", { source: v })} options={[{ v: "category", label: "Same category" }, { v: "latest", label: "Newest products" }]} />
        </>;
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[440px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="relative rounded-xl border border-admin-gray-200 bg-white p-3 shadow-sm">
          <Label>Preview with product</Label>
          <button type="button" onClick={() => setPicking((v) => !v)} className={cn(INPUT, "flex items-center gap-2 text-left")}>
            <Thumb src={current?.image ?? null} /><span className="min-w-0 flex-1 truncate">{current?.name ?? "No products yet"}</span><Search className="h-4 w-4 text-admin-gray-400" />
          </button>
          {picking && (
            <div className="absolute inset-x-3 top-full z-30 -mt-1 rounded-lg border border-admin-gray-200 bg-white p-2 shadow-lg">
              <input autoFocus value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Search products…" className={INPUT} />
              <div className="mt-1 max-h-72 overflow-y-auto">
                {picks.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setPreviewSlug(p.slug); setPicking(false); setPq(""); }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-admin-primary-lighter"><Thumb src={p.image} /><span className="truncate">{p.name}</span></button>
                ))}
                {picks.length === 0 && <p className="px-2 py-3 text-xs text-admin-gray-500">No matching products.</p>}
              </div>
            </div>
          )}
        </div>

        <Card icon={Palette} title="Theme colour" subtitle={c.accent.toUpperCase()} open={open === "theme"} onToggle={() => toggle("theme")}>
          <ColorInput label="Buttons, links, selected size" value={c.accent} onChange={(v) => update((p) => ({ ...p, accent: v }))} swatches={ACCENTS} />
        </Card>

        <Card icon={ShoppingCart} title="Cart buttons & floating bar" subtitle="Add to Cart on product cards · − / + · View Cart bar" open={open === "cart"} onToggle={() => toggle("cart")}>
          <p className="-mt-1 text-xs text-admin-gray-500">Applies across the store — homepage, product page and every product grid.</p>
          <div className="divide-y divide-admin-gray-100 rounded-lg border border-admin-gray-200 px-2">
            <Toggle on={c.cart.tileButton} onChange={(v) => setPart("cart", { tileButton: v })}>Add to Cart button on product cards</Toggle>
            <Toggle on={c.cart.stepper} onChange={(v) => setPart("cart", { stepper: v })}>Turn it into − qty + after adding</Toggle>
            <Toggle on={c.cart.floatingBar} onChange={(v) => setPart("cart", { floatingBar: v })}>Floating View Cart bar (items &amp; total)</Toggle>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Text label="Card button text" value={c.cart.tileLabel} onChange={(v) => setPart("cart", { tileLabel: v })} max={20} />
            <Text label="Bar button text" value={c.cart.barLabel} onChange={(v) => setPart("cart", { barLabel: v })} max={20} />
          </div>
          <ColorInput label="Floating bar colour" value={c.cart.barColor} onChange={(v) => setPart("cart", { barColor: v })} swatches={["#9f2089", "#16a34a", "#7c3aed", "#0284c7", "#ea580c", "#353543"]} />
          <p className="text-xs text-admin-gray-500">The live preview shows these after you Publish on the homepage; the product page preview shows them straight away.</p>
        </Card>

        <p className="px-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-admin-gray-400">Page sections · drag to reorder · switch to hide</p>
        {c.order.map((k, i) => (
          <div key={k} draggable={open !== k}
            onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }}
            onDragEnd={() => setDrag(null)}
            className={cn("relative transition", drag === i && "opacity-50", hidden.has(k) && "opacity-70")}>
            <div className="absolute -left-0.5 top-[22px] z-10 cursor-grab text-admin-gray-300 active:cursor-grabbing" aria-hidden><GripVertical className="h-4 w-4" /></div>
            <Card icon={SECTION_ICON[k]} title={PP_SECTION_LABEL[k]} subtitle={hidden.has(k) ? "Hidden" : PP_SECTION_HINT[k]} open={open === k} onToggle={() => toggle(k)}
              enabled={!hidden.has(k)} onEnabled={(v) => setShown(k, v)} tone={hidden.has(k) ? "muted" : "default"}>
              {editor(k)}
              <div className="flex gap-1 border-t border-admin-gray-100 pt-3">
                <IconBtn label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp /></IconBtn>
                <IconBtn label="Move down" disabled={i === c.order.length - 1} onClick={() => move(i, i + 1)}><ArrowDown /></IconBtn>
              </div>
            </Card>
          </div>
        ))}
        <p className="px-1 pb-2 pt-1 text-xs text-admin-gray-400">Edits save as a draft automatically. Shoppers see them only after you Publish.</p>
      </div>

      <div className="order-first flex h-[80vh] flex-col gap-3 lg:order-none lg:sticky lg:top-[100px] lg:h-[calc(100vh-206px)] lg:min-h-[520px]">
        <EditorToolbar ed={ed} device={device} setDevice={setDevice} openUrl={url} />
        <div className="min-h-0 flex-1"><Preview url={url} version={ed.version} device={device} focus={focus} /></div>
      </div>
      <Toast text={ed.toast} />
      {picking && <button type="button" aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={() => setPicking(false)} />}
    </div>
  );
}
