"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ImageIcon, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedProduct } from "@/lib/shop-feed-shared";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const BADGE: Record<string, string> = { new: "New", best: "Bestseller", hot: "Trending", featured: "Featured" };

/** "09h : 03m : 46s" until a live campaign ends (the Meesho deal timer). */
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
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#ffead9] px-2 py-[3px] text-[11px] font-bold leading-none text-[#ef7b3f]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#ef7b3f]" />{pad(h)}h : {pad(m)}m : {pad(s % 60)}s
    </span>
  );
}

/**
 * Product tile in the style of Meesho's mobile grid: tall image with a
 * wishlist heart, one-line title, price / MRP / % off, and a green rating pill.
 */
export function ProductTile({ p, wished, onWish, priority, lines = true }: {
  p: FeedProduct; wished: boolean; onWish: (id: number, next: boolean) => void; priority?: boolean;
  /** Hairline right/bottom dividers, for tiles sitting edge-to-edge in the feed grid. */
  lines?: boolean;
}) {
  const router = useRouter();
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

  return (
    <Link href={`/shop/product?slug=${encodeURIComponent(p.slug)}`} className={cn("group flex min-w-0 flex-col bg-white pb-3 outline-none focus-visible:ring-2 focus-visible:ring-storefront-green", lines && "shadow-[inset_-1px_-1px_0_#e7e5ec]")}>
      <div className="relative aspect-[1/1.12] w-full overflow-hidden bg-[#f7f7f7]">
        {p.image && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/${p.image}`} alt={p.name} loading={priority ? "eager" : "lazy"} onError={() => setImgOk(false)}
            className={cn("h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]", out && "opacity-60 grayscale")} />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[#c4c4cc]"><ImageIcon className="h-10 w-10" strokeWidth={1.5} /></span>
        )}
        <button type="button" onClick={toggleWish} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={wished}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-[0_1px_4px_rgba(0,0,0,0.15)] transition-transform active:scale-90">
          <Heart className={cn("h-[18px] w-[18px]", wished ? "fill-[#ef4444] text-[#ef4444]" : "text-[#333]")} strokeWidth={2} />
        </button>
        {out && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">Out of stock</span>}
      </div>
      <div className="px-2.5 pt-2">
        {(p.dealEndsAt || BADGE[p.badge]) && (
          <div className="mb-1 flex flex-wrap gap-1">
            {BADGE[p.badge] && <span className="rounded-full bg-[#7525e8] px-2 py-[3px] text-[11px] font-bold leading-none text-white">{BADGE[p.badge]}</span>}
            {p.dealEndsAt && <DealTimer endsAt={p.dealEndsAt} />}
          </div>
        )}
        <p className="truncate text-[14px] leading-[18px] text-[#666]">{p.name}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <b className="text-[17px] font-bold text-[#333]">{rupees(p.finalPrice)}</b>
          {p.discountPct > 0 && <>
            <s className="text-[12px] text-[#999]">{rupees(p.price)}</s>
            <span className="text-[12px] font-bold text-[#13834d]">{p.discountPct}% off</span>
          </>}
        </div>
        {p.stock === "low" && <p className="mt-1 text-[11px] font-semibold text-[#d9480f]">Hurry, only a few left</p>}
        {p.rating !== null && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[12px] font-bold text-white",
              p.rating >= 3.5 ? "bg-[#23bb75]" : p.rating >= 2.5 ? "bg-[#f4b619]" : "bg-[#e56b31]")}>
              {p.rating.toFixed(1)}<Star className="h-2.5 w-2.5 fill-white" strokeWidth={0} />
            </span>
            <span className="text-[12px] text-[#8b8ba3]">({p.reviews.toLocaleString("en-IN")})</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function ProductTileSkeleton() {
  return (
    <div className="bg-white pb-3 shadow-[inset_-1px_-1px_0_#e7e5ec]" aria-hidden>
      <div className="aspect-[1/1.12] w-full animate-pulse bg-[#eeeef3]" />
      <div className="space-y-2 px-2.5 pt-2.5">
        <div className="h-3.5 w-4/5 animate-pulse rounded bg-[#eeeef3]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-[#eeeef3]" />
        <div className="h-3.5 w-1/4 animate-pulse rounded bg-[#eeeef3]" />
      </div>
    </div>
  );
}
