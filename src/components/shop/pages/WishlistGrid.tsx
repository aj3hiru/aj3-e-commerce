"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedProduct } from "@/lib/shop-feed-shared";
import { ProductTile, tileGridClass } from "@/components/shop/home/ProductTile";
import { useHomeTheme } from "@/components/shop/home/HomeTheme";
import { Empty, btnPrimary } from "@/components/shop/ui/Meesho";

/** Wishlist as Meesho product cards; un-hearting a product removes it from the list. */
export function WishlistGrid({ products }: { products: FeedProduct[] }) {
  const { card } = useHomeTheme();
  const [list, setList] = useState(products);
  const onWish = useCallback((id: number, next: boolean) => { if (!next) setList((l) => l.filter((p) => p.id !== id)); }, []);
  if (list.length === 0) {
    return <Empty icon={Heart} title="Your wishlist is empty" text="Tap the ♡ on any product to save it here for later."
      action={<Link href="/shop" className={cn(btnPrimary, "w-56")}>Explore Products</Link>} />;
  }
  return (
    <>
      <p className="bg-white px-4 pb-3 pt-1 text-[13px] text-[#8b8ba3]">{list.length} saved item{list.length === 1 ? "" : "s"}</p>
      <div className={cn("grid grid-cols-2 sm:grid-cols-3", tileGridClass(card.gap))}>
        {list.map((p) => <ProductTile key={p.id} p={p} wished onWish={onWish} />)}
      </div>
    </>
  );
}
