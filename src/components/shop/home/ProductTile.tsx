"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Heart, ImageIcon, Loader2, Minus, Plus, ShoppingCart, Star, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedProduct } from "@/lib/shop-feed-shared";
import { MEESHO } from "@/types/home";
import { useHomeTheme } from "./HomeTheme";
import { productKeys, useCart } from "@/hooks/useCart";
import { useAddToCart } from "@/hooks/useAddToCart";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const BADGE: Record<string, string> = { new: "New", best: "Bestseller", hot: "Trending", featured: "Featured" };

/** "05h : 47m : 01s" until a live campaign ends (Meesho's deal timer). */
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
  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full bg-[#ffe7d6] px-2 text-[12px] font-medium tabular-nums leading-none text-[#f16b24]">
      <Timer className="h-3 w-3" strokeWidth={2.5} />{pad(Math.floor(s / 3600))}h : {pad(Math.floor((s % 3600) / 60))}m : {pad(s % 60)}s
    </span>
  );
}

/** Add to Cart button that turns into − qty + once the product is in the cart. */
export function TileCartButton({ p }: { p: FeedProduct }) {
  const { items, ui } = useCart();
  const { addToCart, setQty } = useAddToCart();
  const [busy, setBusy] = useState(false);
  if (!ui.tileButton || p.stock === "out") return null;
  const keys = productKeys(items, p.id);
  const qty = keys.reduce((n, k) => n + (items[k] ?? 0), 0);
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };

  if (qty > 0 && ui.stepper && keys.length === 1) {
    const key = keys[0];
    return (
      <div className="grid h-[34px] grid-cols-[34px_1fr_34px] items-center overflow-hidden rounded-lg bg-[var(--hp-accent)] text-white" aria-busy={busy}>
        <button type="button" onClick={() => run(() => setQty(key, qty - 1))} aria-label="Decrease quantity" className="grid h-full place-items-center active:bg-black/15"><Minus className="h-4 w-4" strokeWidth={2.6} /></button>
        <span className="grid place-items-center text-[14px] font-bold tabular-nums">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : qty}</span>
        <button type="button" onClick={() => run(() => setQty(key, qty + 1))} aria-label="Increase quantity" className="grid h-full place-items-center active:bg-black/15"><Plus className="h-4 w-4" strokeWidth={2.6} /></button>
      </div>
    );
  }
  const inCart = qty > 0;
  return (
    <button type="button" onClick={() => run(() => addToCart(p.id))}
      className={cn("flex h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border-[1.5px] text-[13px] font-semibold transition active:scale-[0.98]",
        inCart ? "border-[var(--hp-accent)] bg-[var(--hp-accent)] text-white" : "border-[var(--hp-accent)] bg-white text-[var(--hp-accent)]")}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : inCart ? <Check className="h-4 w-4" strokeWidth={2.6} /> : <ShoppingCart className="h-[15px] w-[15px]" strokeWidth={2.2} />}
      {inCart ? `In cart · ${qty}` : ui.tileLabel}
    </button>
  );
}

const ratingBg = (r: number) => (r >= 4 ? MEESHO.rating : r >= 3.5 ? "#23bb75" : r >= 2.5 ? "#f4b619" : "#e56b31");

/**
 * Product tile matching Meesho's mobile grid: white image area with an
 * outline heart, badge + deal-timer pills, grey one-line name, price / MRP /
 * "x% off", and the green rating pill with review count.
 */
export function ProductTile({ p, wished, onWish, priority, lines = true }: {
  p: FeedProduct; wished: boolean; onWish: (id: number, next: boolean) => void; priority?: boolean;
  /** Hairline right/bottom dividers, for tiles sitting edge-to-edge in the feed grid. */
  lines?: boolean;
}) {
  const router = useRouter();
  const { card } = useHomeTheme();
  const [busy, setBusy] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const out = p.stock === "out";

  async function toggleWish(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    onWish(p.id, !wished); // optimistic
    const res = await fetch("/api/shop/wishlist", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: p.id }),
    }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (res?.need_login) { onWish(p.id, wished); router.push(`/shop/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    if (!res?.success) { onWish(p.id, wished); return; }
    onWish(p.id, !!res.wishlisted);
  }

  const badge = card.showBadge ? BADGE[p.badge] : undefined;
  const timer = card.showDealTimer && p.dealEndsAt;
  const boxed = card.gap && lines; // grid tiles become small rounded cards with a gap between them
  return (
    <div className={cn("flex min-w-0 flex-col bg-white pb-3", boxed ? "overflow-hidden rounded-[10px] border border-[#eaeaf2]" : lines && "shadow-[inset_-1px_-1px_0_#eaeaf2]")}>
    <Link href={`/shop/product?slug=${encodeURIComponent(p.slug)}`}
      className="group flex min-w-0 flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--hp-accent)]">
      <div className="relative aspect-[1/1.1] w-full overflow-hidden bg-white">
        {p.image && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/${p.image}`} alt={p.name} loading={priority ? "eager" : "lazy"} onError={() => setImgOk(false)}
            className={cn("h-full w-full object-contain", out && "opacity-50 grayscale")} />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[#f5f5f8] text-[#c9c9d6]"><ImageIcon className="h-10 w-10" strokeWidth={1.4} /></span>
        )}
        {card.showWishlist && (
          <button type="button" onClick={toggleWish} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={wished}
            className="absolute right-2 top-2 grid h-9 w-9 place-items-center transition-transform active:scale-90">
            <Heart className={cn("h-[22px] w-[22px]", wished ? "fill-[#ef4444] text-[#ef4444]" : "text-[#666]")} strokeWidth={1.6} />
          </button>
        )}
        {out && <span className="absolute inset-x-0 bottom-0 bg-[#353543]/75 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">Out of stock</span>}
      </div>
      <div className="px-2 pt-2">
        {(badge || timer) && (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {badge && (
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full px-1.5 text-[12px] font-bold leading-none text-white" style={{ background: MEESHO.mall }}>
                <BadgeCheck className="h-3.5 w-3.5 fill-white text-[#682bf2]" strokeWidth={2.5} />{badge}
              </span>
            )}
            {timer && <DealTimer endsAt={p.dealEndsAt!} />}
          </div>
        )}
        <p className="truncate text-[13px] font-medium leading-5 text-[#8b8ba3]">{p.name}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
          <b className="text-[18px] font-bold leading-6 text-[#353543]">{rupees(p.finalPrice)}</b>
          {card.showDiscount && p.discountPct > 0 && <>
            <s className="text-[12.5px] text-[#8b8ba3]">{rupees(p.price)}</s>
            <span className="text-[13px] text-[#353543]">{p.discountPct}% off</span>
          </>}
        </div>
        {p.stock === "low" && <p className="mt-0.5 text-[12.5px] font-medium text-[#038d63]">Only a few left — order soon</p>}
        {card.showRating && p.rating !== null && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[13px] font-bold leading-none text-white" style={{ background: ratingBg(p.rating) }}>
              {p.rating.toFixed(1)}<Star className="h-3 w-3 fill-white" strokeWidth={0} />
            </span>
            <span className="text-[12.5px] text-[#8b8ba3]">({p.reviews})</span>
          </div>
        )}
      </div>
    </Link>
    <div className="px-2 pt-2.5"><TileCartButton p={p} /></div>
    </div>
  );
}

/** Grid classes matching the card style: a small gap on a light grey background, or edge-to-edge tiles. */
export const tileGridClass = (gap: boolean) => (gap ? "gap-2 bg-[#f3f3f8] p-2" : "bg-white");

export function ProductTileSkeleton() {
  const { card } = useHomeTheme();
  return (
    <div className={cn("bg-white pb-3", card.gap ? "overflow-hidden rounded-[10px] border border-[#eaeaf2]" : "shadow-[inset_-1px_-1px_0_#eaeaf2]")} aria-hidden>
      <div className="aspect-[1/1.1] w-full animate-pulse bg-[#f0f0f5]" />
      <div className="space-y-2 px-2 pt-2.5">
        <div className="h-3.5 w-4/5 animate-pulse rounded bg-[#f0f0f5]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-[#f0f0f5]" />
        <div className="h-5 w-1/4 animate-pulse rounded-full bg-[#f0f0f5]" />
      </div>
    </div>
  );
}
