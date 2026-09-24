"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { FeedProduct } from "@/lib/shop-feed-shared";
import { ProductTile } from "./ProductTile";

/** An admin "product grid" section shown Meesho-style: a titled, swipeable row of product tiles. */
export function HomeRow({ title, products, viewMoreUrl, wishlisted }: { title: string | null; products: FeedProduct[]; viewMoreUrl: string | null; wishlisted: number[] }) {
  const [wish, setWish] = useState<Set<number>>(() => new Set(wishlisted));
  const onWish = useCallback((id: number, next: boolean) => setWish((s) => { const n = new Set(s); if (next) n.add(id); else n.delete(id); return n; }), []);
  if (products.length === 0) return null;
  return (
    <section className="bg-white pb-3 pt-4">
      <div className="mb-3 flex items-center justify-between px-4">
        <h2 className="text-[18px] font-medium leading-6 text-[#353543]">{title || "Top picks for you"}</h2>
        {viewMoreUrl && <Link href={viewMoreUrl} className="flex items-center text-[13px] font-bold text-[var(--hp-accent)]">View all <ChevronRight className="h-4 w-4" /></Link>}
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((p) => (
          <div key={p.id} className="w-[44%] max-w-[210px] shrink-0 overflow-hidden rounded-lg border border-[#eaeaf2] sm:w-[200px]">
            <ProductTile p={p} wished={wish.has(p.id)} onWish={onWish} lines={false} />
          </div>
        ))}
      </div>
    </section>
  );
}
