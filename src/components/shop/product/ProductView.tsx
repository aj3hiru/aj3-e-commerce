"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award, Banknote, BadgeCheck, BadgePercent, Box, ChevronDown, ChevronRight, FastForward, Gift, Headphones, Heart, ImageIcon, Leaf, Loader2,
  PackageCheck, RotateCcw, Share2, ShieldCheck, ShoppingCart, Star, Store, Tag, Timer, Truck, User, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAddToCart } from "@/hooks/useAddToCart";
import { ProductTile } from "@/components/shop/home/ProductTile";
import type { ProductPageData } from "@/lib/product-page-data";
import type { AssuranceIcon, PPSectionKey, ProductPageConfig, TrustIcon } from "@/types/product-page";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const src = (img: string) => (/^https:/.test(img) ? img : `/${img}`);
const ratingBg = (r: number) => (r >= 4 ? "#038d63" : r >= 3 ? "#23bb75" : r >= 2 ? "#f4b619" : "#e56b31");
const TRUST: Record<TrustIcon, typeof Box> = { check: BadgeCheck, box: PackageCheck, star: Award, shield: ShieldCheck, truck: Truck, tag: Tag, award: Award, leaf: Leaf };
const ASSURE: Record<AssuranceIcon, { icon: typeof Box; color: string }> = {
  price: { icon: BadgePercent, color: "#12a06b" }, cod: { icon: Banknote, color: "#12a06b" }, returns: { icon: RotateCcw, color: "#f28c28" },
  truck: { icon: Truck, color: "#5d7eea" }, shield: { icon: ShieldCheck, color: "#5d7eea" }, support: { icon: Headphones, color: "#9f2089" },
  quality: { icon: Award, color: "#f28c28" }, gift: { icon: Gift, color: "#e0457b" },
};
/** Sections that start with Meesho's 8px grey band. */
const GAP_BEFORE: PPSectionKey[] = ["sizes", "soldBy", "highlights", "reviews", "assurance", "related"];

function Gap() { return <div className="h-2 bg-[#eaeaf2]" aria-hidden />; }

function useToast() {
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 2200); return () => clearTimeout(t); }, [msg]);
  const node = msg ? <div role="status" className="fixed bottom-24 left-1/2 z-[1100] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#353543] px-4 py-2 text-[13px] font-medium text-white shadow-lg">{msg}</div> : null;
  return [node, setMsg] as const;
}

function DealTimer({ endsAt }: { endsAt: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const end = new Date(endsAt).getTime();
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (left === null || left <= 0) return null;
  const s = Math.floor(left / 1000), pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      <span className="text-[14px]">Deal</span>
      <span className="inline-flex h-[24px] items-center gap-1 rounded-[4px] border border-[#ffc19a] bg-[#ffe7d6] px-2 text-[13px] font-semibold tabular-nums text-[#f16b24]">
        <Timer className="h-3.5 w-3.5" strokeWidth={2.5} />{pad(Math.floor(s / 3600))}h : {pad(Math.floor((s % 3600) / 60))}m : {pad(s % 60)}s
      </span>
    </div>
  );
}

/* ───────────────────────── gallery ───────────────────────── */

function Gallery({ images, name, cfg }: { images: string[]; name: string; cfg: ProductPageConfig["gallery"] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    if (zoom === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, [zoom]);

  if (images.length === 0) {
    return <div className="grid aspect-square w-full place-items-center bg-[#f5f5f8] text-[#c9c9d6]"><ImageIcon className="h-14 w-14" strokeWidth={1.2} /></div>;
  }
  return (
    <>
      <div ref={track} onScroll={(e) => setActive(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.map((img, i) => (
          <button key={img} type="button" onClick={() => cfg.zoom && setZoom(i)} aria-label={cfg.zoom ? `Zoom image ${i + 1}` : undefined}
            className={cn("flex w-full shrink-0 snap-center justify-center bg-white", !cfg.zoom && "cursor-default")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(img)} alt={i === 0 ? name : ""} loading={i === 0 ? "eager" : "lazy"} className="aspect-square w-[82%] object-contain shop:max-w-[440px]" />
          </button>
        ))}
      </div>
      {cfg.dots && images.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2.5">
          {images.map((_, i) => (
            <button key={i} type="button" aria-label={`Image ${i + 1}`}
              onClick={() => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: "smooth" })}
              className={cn("h-1 rounded-full transition-all", i === active ? "w-3 bg-[var(--hp-accent)]" : "w-2 bg-[#dfdfe9]")} />
          ))}
        </div>
      )}
      {zoom !== null && (
        <div className="fixed inset-0 z-[1000] flex flex-col bg-black" role="dialog" aria-label="Product images">
          <div className="flex h-14 items-center justify-between px-4 text-white">
            <span className="text-sm">{zoom + 1} / {images.length}</span>
            <button type="button" onClick={() => setZoom(null)} aria-label="Close" className="grid h-10 w-10 place-items-center"><X className="h-6 w-6" /></button>
          </div>
          <div className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            ref={(el) => { if (el && el.dataset.init !== "1") { el.dataset.init = "1"; el.scrollLeft = zoom * el.clientWidth; } }}
            onScroll={(e) => setZoom(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
            {images.map((img) => (
              <div key={img} className="flex w-full shrink-0 snap-center items-center justify-center overflow-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(img)} alt="" className="max-h-full max-w-full touch-pinch-zoom object-contain" />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────────────────── reviews ───────────────────────── */

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)}>
          <Star className={cn("h-7 w-7", n <= value ? "fill-[#f4b619] text-[#f4b619]" : "text-[#cfcedc]")} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

function WriteReview({ productId, loggedIn, slug }: { productId: number; loggedIn: boolean; slug: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!loggedIn) {
    return (
      <Link href={`/shop/login?redirect=${encodeURIComponent(`/shop/product?slug=${slug}`)}`} className="block py-3 text-[14px] font-medium text-[var(--hp-accent)]">
        Login to write a review
      </Link>
    );
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="py-3 text-[14px] font-bold uppercase text-[var(--hp-accent)]">Write a review</button>;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/shop/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, rating, reviewText: text }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    setMsg({ ok: !!res?.success, text: res?.message || "Couldn't submit — please try again." });
    if (res?.success) setText("");
  }
  return (
    <form onSubmit={submit} className="space-y-3 py-4">
      <p className="text-[16px] font-semibold">Rate this product</p>
      <Stars value={rating} onChange={setRating} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="Share your experience (optional)"
        className="w-full rounded-[4px] border border-[#cfcedc] px-3 py-2 text-[14px] outline-none focus:border-[var(--hp-accent)]" />
      {msg && <p className={cn("text-[13px]", msg.ok ? "text-[#038d63]" : "text-[#e5485f]")}>{msg.text}</p>}
      <button type="submit" disabled={busy} className="h-10 rounded-[4px] bg-[var(--hp-accent)] px-6 text-[15px] font-medium text-white disabled:opacity-60">
        {busy ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}

const BARS: { label: string; star: number; color: string }[] = [
  { label: "Excellent", star: 5, color: "#038d63" }, { label: "Very Good", star: 4, color: "#23bb75" }, { label: "Good", star: 3, color: "#f4b619" },
  { label: "Average", star: 2, color: "#f28c28" }, { label: "Poor", star: 1, color: "#e5485f" },
];

function Reviews({ d, cfg, loggedIn }: { d: ProductPageData; cfg: ProductPageConfig["reviews"]; loggedIn: boolean }) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...d.rating.dist);
  const list = all ? d.reviews : d.reviews.slice(0, cfg.perPage);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="px-4 pt-5" id="reviews">
      <h2 className="text-[18px] font-semibold leading-6">{cfg.title}</h2>
      {d.rating.count === 0 ? (
        <p className="pt-3 text-[14px] text-[#8b8ba3]">No ratings yet — be the first to rate this product.</p>
      ) : cfg.showBars && (
        <div className="flex items-center gap-4 pb-6 pt-5">
          <div className="w-[104px] shrink-0">
            <p className="flex items-start text-[44px] font-bold leading-none text-[#038d63]">{d.rating.avg?.toFixed(1)}<Star className="ml-1 mt-1.5 h-4 w-4 fill-[#038d63] text-[#038d63]" /></p>
            <p className="mt-3 text-[12px] leading-[18px] text-[#8b8ba3]">{d.rating.count} Ratings,<br />{d.rating.withText} Reviews</p>
          </div>
          <div className="grid flex-1 grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3">
            {BARS.map((b) => (
              <div key={b.star} className="contents">
                <span className="text-right text-[12px] leading-none">{b.label}</span>
                <span className="h-1 overflow-hidden rounded-full bg-[#eaeaf2]"><span className="block h-full rounded-full" style={{ width: `${(d.rating.dist[b.star - 1] / max) * 60}%`, minWidth: d.rating.dist[b.star - 1] ? 6 : 0, background: b.color }} /></span>
                <span className="min-w-[28px] text-right text-[12px] leading-none text-[#8b8ba3]">{d.rating.dist[b.star - 1]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {list.length > 0 && (
        <ul className="border-t border-[#dcdce6]">
          {list.map((r) => (
            <li key={r.id} className="border-b border-[#dcdce6] py-4">
              <p className="flex items-center gap-2.5 text-[14px] font-medium text-[#616173]">
                <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#eef3ff]"><User className="h-3 w-3 fill-[#bccbf6] text-[#bccbf6]" /></span>{r.name}
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[13px] font-bold text-white" style={{ background: ratingBg(r.rating) }}>
                  {r.rating.toFixed(1)}<Star className="h-3 w-3 fill-white" strokeWidth={0} />
                </span>
                <span className="h-1 w-1 rounded-full bg-[#cfcedc]" />
                <span className="text-[12px] text-[#8b8ba3]">Posted on {fmt(r.date)}</span>
              </div>
              {r.text && <p className="mt-2.5 whitespace-pre-line break-words text-[14px] leading-[21px]">{r.text}</p>}
            </li>
          ))}
        </ul>
      )}
      {d.reviews.length > cfg.perPage && (
        <button type="button" onClick={() => setAll((v) => !v)} className="flex items-center gap-2 py-4 text-[14px] font-bold uppercase text-[var(--hp-accent)]">
          {all ? "Show fewer reviews" : "View all reviews"}<ChevronRight className={cn("h-4 w-4 transition-transform", all && "-rotate-90")} strokeWidth={2.5} />
        </button>
      )}
      {cfg.allowWrite && <WriteReview productId={d.product.id} loggedIn={loggedIn} slug={d.product.slug} />}
      <div className="h-3" />
    </div>
  );
}

/* ───────────────────────── main ───────────────────────── */

export function ProductView({ d, cfg, wished: initialWished, loggedIn, wishlisted }: {
  d: ProductPageData; cfg: ProductPageConfig; wished: boolean; loggedIn: boolean; wishlisted: number[];
}) {
  const router = useRouter();
  const { addToCart, adding } = useAddToCart();
  const [toast, setToast] = useToast();
  const defSize = d.sizes.find((z) => z.isDefault) ?? d.sizes[0] ?? null;
  const [sizeId, setSizeId] = useState<number | null>(defSize?.id ?? null);
  const size = d.sizes.find((z) => z.id === sizeId) ?? null;
  const [wished, setWished] = useState(initialWished);
  const [wish, setWish] = useState<Set<number>>(() => new Set(wishlisted));
  const onWish = useCallback((id: number, next: boolean) => setWish((s) => { const n = new Set(s); if (next) n.add(id); else n.delete(id); return n; }), []);
  const [detailsOpen, setDetailsOpen] = useState(cfg.highlights.detailsOpen);
  const [offerOpen, setOfferOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const slot = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);

  const hidden = new Set(cfg.hidden);
  const show = (k: PPSectionKey) => !hidden.has(k);
  const mrp = size?.mrp ?? d.price.mrp;
  const final = size?.final ?? d.price.final;
  const discountPct = size?.discountPct ?? d.price.discountPct;
  const stock = size?.stock ?? d.stock;
  const out = stock === "out";

  // The bottom bar sticks until its own place on the page (below the
  // assurance badges) scrolls into view, then sits there like Meesho's.
  const actionsShown = show("actions") && (cfg.actions.showCart || cfg.actions.showBuy);
  useEffect(() => {
    if (!actionsShown || !cfg.actions.sticky) return;
    const check = () => { const el = slot.current; if (el) setDocked(el.getBoundingClientRect().bottom <= window.innerHeight + 1); };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { window.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, [actionsShown, cfg.actions.sticky]);
  const floating = actionsShown && cfg.actions.sticky && !docked;
  useEffect(() => {
    if (!floating) return;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "65px";
    return () => { document.body.style.paddingBottom = prev; };
  }, [floating]);

  async function toggleWish() {
    if (!loggedIn) { router.push(`/shop/login?redirect=${encodeURIComponent(`/shop/product?slug=${d.product.slug}`)}`); return; }
    const next = !wished;
    setWished(next);
    const res = await fetch("/api/shop/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: d.product.id }) })
      .then((r) => r.json()).catch(() => null);
    if (!res?.success) { setWished(!next); setToast("Couldn't update wishlist"); return; }
    setWished(!!res.wishlisted);
    setToast(res.wishlisted ? "Added to wishlist" : "Removed from wishlist");
  }

  async function share() {
    const url = window.location.href.replace(/[?&]hc=draft(&v=\d+)?/, "");
    try {
      if (navigator.share) { await navigator.share({ title: d.product.name, url }); return; }
      await navigator.clipboard.writeText(url);
      setToast("Link copied");
    } catch { /* cancelled */ }
  }

  async function add(buy: boolean) {
    if (out) return;
    if (buy) setBuying(true);
    const res = await addToCart(d.product.id, 1, sizeId, { silent: buy });
    if (buy) {
      if (res?.success) router.push("/shop/checkout");
      else { setBuying(false); setToast(res?.message || "Couldn't add to cart"); }
      return;
    }
    if (res?.success) setToast("Added to cart");
  }

  const highlights = useMemo(() => {
    const h = cfg.highlights, rows: { name: string; value: string }[] = [];
    if (h.showBrand && d.product.brand) rows.push({ name: "Brand", value: d.product.brand });
    if (h.showCategory && d.product.category) rows.push({ name: "Category", value: d.product.subcategory ? `${d.product.category.name} · ${d.product.subcategory}` : d.product.category.name });
    if (h.showUnit && d.product.unit) rows.push({ name: "Sold by", value: d.product.unit });
    if (h.showSku && d.product.sku) rows.push({ name: "SKU", value: d.product.sku });
    return [...d.specs, ...rows];
  }, [cfg.highlights, d]);

  const buttons = (
    <div className="flex gap-2 px-4 py-3">
      {out ? (
        <button type="button" disabled className="h-10 flex-1 rounded-[4px] bg-[#cfcedc] text-[16px] font-medium text-white">Out of Stock</button>
      ) : <>
        {cfg.actions.showCart && (
          <button type="button" onClick={() => add(false)} disabled={adding}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[4px] border border-[var(--hp-accent)] bg-white text-[16px] font-medium text-[var(--hp-accent)] disabled:opacity-60">
            {adding && !buying ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5 fill-[var(--hp-accent)]/15" strokeWidth={2} />}{cfg.actions.cartLabel}
          </button>
        )}
        {cfg.actions.showBuy && (
          <button type="button" onClick={() => add(true)} disabled={buying}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[4px] bg-[var(--hp-accent)] text-[16px] font-medium text-white disabled:opacity-60">
            {buying ? <Loader2 className="h-5 w-5 animate-spin" /> : <FastForward className="h-[18px] w-[18px] fill-white" strokeWidth={0} />}{cfg.actions.buyLabel}
          </button>
        )}
      </>}
    </div>
  );

  function section(k: PPSectionKey): React.ReactNode {
    switch (k) {
      case "breadcrumb":
        return (
          <nav aria-label="Breadcrumb" className="px-4 py-2 text-[14px] leading-[22px]">
            <Link href="/shop" className="text-[var(--hp-accent)]">Home</Link>
            {d.product.category && <> <span className="px-0.5">/</span> <Link href={`/shop/category?slug=${encodeURIComponent(d.product.category.slug)}`} className="text-[var(--hp-accent)]">{d.product.category.name}</Link></>}
            {" "}<span className="px-0.5">/</span>{" "}
            <span className="inline-block max-w-[170px] truncate align-bottom">{d.product.name}</span>
          </nav>
        );
      case "gallery": return <Gallery images={d.product.images} name={d.product.name} cfg={cfg.gallery} />;
      case "trust": {
        const t = cfg.trust;
        if (!t.badge && t.items.length === 0) return null;
        return (
          <div className="flex h-[36px] items-center justify-between gap-2 px-4" style={{ background: t.bg }}>
            {t.badge && (
              <span className="inline-flex h-[24px] shrink-0 items-center gap-1 rounded-full px-2 text-[14px] font-bold text-white" style={{ background: t.badgeColor }}>
                <BadgeCheck className="h-4 w-4 fill-white" style={{ color: t.badgeColor }} strokeWidth={2.5} />{t.badge}
              </span>
            )}
            {t.items.map((it) => { const I = TRUST[it.icon]; return (
              <span key={it.id} className="flex min-w-0 items-center gap-1 text-[12px]">
                <I className="h-4 w-4 shrink-0 text-[#3f64e5]" strokeWidth={2} /><span className="truncate">{it.label}</span>
              </span>
            ); })}
          </div>
        );
      }
      case "similar": {
        const thumbs = [{ id: d.product.id, slug: d.product.slug, image: d.product.images[0] ?? null, name: d.product.name }, ...d.similar];
        return (
          <div className="px-4 pt-4">
            <p className="text-[16px] font-medium text-[#8b8ba3]">{thumbs.length} {cfg.similar.title}</p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {thumbs.map((t, i) => (
                <Link key={t.id} href={`/shop/product?slug=${encodeURIComponent(t.slug)}`} title={t.name} aria-current={i === 0 ? "page" : undefined}
                  className={cn("h-16 w-12 shrink-0 overflow-hidden rounded-[4px] border bg-[#f5f5f8]", i === 0 ? "border-2 border-[var(--hp-accent)]" : "border-[#dfdfe9]")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t.image ? <img src={src(t.image)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-5 h-5 w-5 text-[#c9c9d6]" />}
                </Link>
              ))}
            </div>
          </div>
        );
      }
      case "info": {
        const i = cfg.info;
        return (
          <div className="px-4 pb-5 pt-5">
            <div className="flex items-start gap-3">
              <h1 className="line-clamp-2 flex-1 text-[16px] font-medium leading-[22px] text-[#8b8ba3]">{d.product.name}</h1>
              {i.showWishlist && (
                <button type="button" onClick={toggleWish} aria-pressed={wished} className="flex shrink-0 flex-col items-center gap-1 text-[12px]">
                  <Heart className={cn("h-[22px] w-[22px]", wished ? "fill-[#ef4444] text-[#ef4444]" : "text-[#353543]")} strokeWidth={1.5} />Wishlist
                </button>
              )}
              {i.showShare && (
                <button type="button" onClick={share} className="flex shrink-0 flex-col items-center gap-1 pl-2 text-[12px]">
                  <Share2 className="h-[22px] w-[22px]" strokeWidth={1.5} />Share
                </button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[24px] font-bold leading-8">{rupees(final)}</span>
              {discountPct > 0 && <><s className="text-[14px] text-[#8b8ba3]">{rupees(mrp)}</s><span className="text-[14px]">{discountPct}% off</span></>}
            </div>
            {i.showOffer && d.offer && (
              <button type="button" onClick={() => setOfferOpen(true)} className="mt-1 flex items-center gap-1 text-[16px] font-medium text-[#038d63]">
                {rupees(d.offer.price)} with {d.offer.count} Special Offer{d.offer.count > 1 ? "s" : ""}<ChevronRight className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}
            {i.showDeal && d.price.dealEndsAt && <DealTimer endsAt={d.price.dealEndsAt} />}
            {i.deliveryText && (
              <div className="mt-2.5">
                <p className="text-[16px] font-medium text-[#616173]">{i.deliveryText}</p>
                {i.deliveryStrike && <s className="text-[12px] text-[#8b8ba3]">{i.deliveryStrike}</s>}
              </div>
            )}
            {i.showStock && (stock === "low" || out) && (
              <p className={cn("mt-2 text-[13px] font-medium", out ? "text-[#e5485f]" : "text-[#f16b24]")}>{out ? "Out of stock" : "Only a few left — order soon"}</p>
            )}
            {i.showRating && d.rating.count > 0 && d.rating.avg !== null && (
              <a href="#reviews" className="mt-3 flex items-center gap-2">
                <span className="inline-flex h-[24px] items-center gap-1 rounded-full px-2 text-[15px] font-bold text-white" style={{ background: ratingBg(d.rating.avg) }}>
                  {d.rating.avg.toFixed(1)}<Star className="h-3.5 w-3.5 fill-white" strokeWidth={0} />
                </span>
                <span className="text-[12px] text-[#8b8ba3]">{d.rating.count} Ratings, {d.rating.withText} Reviews</span>
              </a>
            )}
          </div>
        );
      }
      case "sizes":
        if (d.sizes.length === 0) return null;
        return (
          <div className="px-4 pb-6 pt-5">
            <h2 className="text-[18px] font-semibold leading-6">{cfg.sizes.title}</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              {d.sizes.map((z) => {
                const on = z.id === sizeId, no = z.stock === "out";
                return (
                  <button key={z.id} type="button" onClick={() => setSizeId(z.id)} aria-pressed={on}
                    className={cn("flex min-h-8 flex-col items-center justify-center rounded-full border px-5 py-1 text-[16px] leading-5",
                      on ? "border-[var(--hp-accent)] text-[var(--hp-accent)]" : "border-[#cfcedc] text-[#353543]", no && "text-[#b8b8c8] line-through")}
                    style={on ? { background: "color-mix(in srgb, var(--hp-accent) 9%, white)" } : undefined}>
                    {z.label}
                    {cfg.sizes.showPrice && d.sizes.some((x) => x.final !== z.final) && <span className="text-[11px] leading-4 opacity-80">{rupees(z.final)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      case "soldBy": {
        const s = cfg.soldBy;
        return (
          <div className="px-4 pb-6 pt-5">
            <h2 className="text-[18px] font-semibold leading-6">{s.title}</h2>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef3ff]"><Store className="h-5 w-5 text-[#5d7eea]" strokeWidth={1.8} /></span>
              <p className="min-w-0 flex-1 break-words text-[16px] font-medium leading-[22px]">{s.name || d.store.name}</p>
              {s.showViewShop && (
                <Link href={s.viewShopUrl} className="flex h-[28px] shrink-0 items-center rounded-[4px] border border-[var(--hp-accent)] px-4 text-[14px] font-medium text-[var(--hp-accent)]">{s.viewShopLabel}</Link>
              )}
            </div>
            {s.showRating && d.store.rating !== null && (
              <div className="mt-3 pl-[52px]">
                <span className="inline-flex h-[22px] items-center gap-1 rounded-full border border-[#d9e2ff] px-2 text-[14px] font-medium text-[#5d7eea]">{d.store.rating.toFixed(1)}<Star className="h-3 w-3 fill-[#5d7eea]" strokeWidth={0} /></span>
                <p className="mt-1 text-[12px] text-[#8b8ba3]">{d.store.count.toLocaleString("en-IN")} Ratings</p>
              </div>
            )}
          </div>
        );
      }
      case "highlights": {
        const h = cfg.highlights;
        if (highlights.length === 0 && !d.product.description) return null;
        return (
          <div className="px-4 pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold leading-6">{h.title}</h2>
              {h.showCopy && highlights.length > 0 && (
                <button type="button" onClick={async () => { try { await navigator.clipboard.writeText([d.product.name, ...highlights.map((x) => `${x.name}: ${x.value}`)].join("\n")); setToast("Copied"); } catch { /* blocked */ } }}
                  className="flex items-center gap-1 text-[14px] font-bold uppercase text-[var(--hp-accent)]">Copy</button>
              )}
            </div>
            {highlights.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 pb-2">
                {highlights.map((x, i) => (
                  <div key={i} className="min-w-0"><dt className="text-[12px] text-[#8b8ba3]">{x.name}</dt><dd className="break-words text-[14px] leading-5">{x.value}</dd></div>
                ))}
              </dl>
            )}
            {d.product.description && (
              <>
                <button type="button" onClick={() => setDetailsOpen((v) => !v)} aria-expanded={detailsOpen} className="flex w-full items-center justify-between py-4 text-[16px] font-semibold">
                  {h.detailsTitle}<ChevronDown className={cn("h-5 w-5 transition-transform", detailsOpen && "rotate-180")} strokeWidth={2.2} />
                </button>
                {detailsOpen && <p className="whitespace-pre-line break-words pb-5 text-[14px] leading-[22px] text-[#616173]">{d.product.description}</p>}
              </>
            )}
            {!d.product.description && <div className="h-3" />}
          </div>
        );
      }
      case "reviews": return <Reviews d={d} cfg={cfg.reviews} loggedIn={loggedIn} />;
      case "assurance": {
        const items = cfg.assurance.items;
        if (items.length === 0) return null;
        return (
          <div className="grid py-3" style={{ background: cfg.assurance.bg, gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map((a, i) => { const A = ASSURE[a.icon]; return (
              <div key={a.id} className={cn("flex flex-col items-center gap-1.5 px-1 text-center", i > 0 && "border-l border-white/90")}>
                <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-white">
                  {a.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={src(a.image)} alt="" className="h-full w-full object-contain" />
                    : <A.icon className="h-[22px] w-[22px]" style={{ color: A.color }} strokeWidth={2} />}
                </span>
                <span className="text-[12px] leading-4">{a.label}</span>
              </div>
            ); })}
          </div>
        );
      }
      case "actions":
        if (!actionsShown) return null;
        return (
          <div ref={slot} className="border-t border-[#eaeaf2]">
            <div className={cn(floating && "invisible")}>{buttons}</div>
          </div>
        );
      case "related":
        if (d.related.length === 0) return null;
        return (
          <div>
            <h2 className="px-4 pb-4 pt-5 text-[20px] font-semibold leading-7">{cfg.related.title}</h2>
            <div className="grid grid-cols-2 border-t border-[#eaeaf2] shop:grid-cols-3">
              {d.related.map((p) => <ProductTile key={p.id} p={p} wished={wish.has(p.id)} onWish={onWish} />)}
            </div>
          </div>
        );
    }
  }

  const rendered: React.ReactNode[] = [];
  for (const k of cfg.order) {
    if (!show(k)) continue;
    const node = section(k);
    if (!node) continue;
    rendered.push(
      <section key={k} data-hc={k}>
        {rendered.length > 0 && GAP_BEFORE.includes(k) && <Gap />}
        {node}
      </section>,
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px] bg-white">
      {rendered}
      {floating && (
        <div className="fixed inset-x-0 bottom-0 z-[900] border-t border-[#eaeaf2] bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="mx-auto max-w-[760px]">{buttons}</div>
        </div>
      )}
      {offerOpen && d.offer && (
        <div className="fixed inset-0 z-[1000] flex items-end bg-black/50" onClick={() => setOfferOpen(false)}>
          <div className="mx-auto w-full max-w-[760px] rounded-t-2xl bg-white p-4 pb-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Special offers">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[18px] font-semibold">Special Offers</p>
              <button type="button" onClick={() => setOfferOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center"><X className="h-5 w-5" /></button>
            </div>
            <ul className="space-y-2.5">
              {d.offer.codes.map((c) => (
                <li key={c.code} className="flex items-center gap-3 rounded-lg border border-dashed border-[#038d63] bg-[#f0faf5] px-3 py-2.5">
                  <BadgePercent className="h-6 w-6 shrink-0 text-[#038d63]" />
                  <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold">{c.label} · {c.title}</p><p className="text-[12px] text-[#616173]">Use code <b className="tracking-wide">{c.code}</b> at checkout</p></div>
                  <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(c.code); setToast("Code copied"); } catch { /* blocked */ } }}
                    className="text-[13px] font-bold uppercase text-[var(--hp-accent)]">Copy</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}
