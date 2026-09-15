"use client";

import Link from "next/link";
import { ImageIcon, ShoppingCart } from "lucide-react";
import { useAddToCart } from "@/hooks/useAddToCart";
import type { ProductCardData } from "./ProductCard";
import { cn } from "@/lib/utils";

/** Verified against renderCard2Product($p, $design) — horizontal image-left,
 *  info-right layout in one of 4 visual designs: design1 = clean minimal,
 *  design2 = ribbon discount badge, design3 = two-tone action strip,
 *  design4 = compact chip. */
export function Card2Product({ product, design = "design1" }: { product: ProductCardData; design?: "design1" | "design2" | "design3" | "design4" }) {
  const { addToCart, adding } = useAddToCart();
  const price = product.price;
  const sale = product.salePrice && product.salePrice > 0 && product.salePrice < price ? product.salePrice : null;
  const outOfStock = product.productType === "physical" && (product.stockQty ?? 0) <= 0;
  const offAmount = sale ? Math.round(price - sale) : 0;
  const offPct = sale && price > 0 ? Math.round(((price - sale) / price) * 100) : 0;
  const isCompact = design === "design4";

  const wrapperClass = cn(
    "flex gap-3 rounded-lg border overflow-hidden bg-white",
    design === "design2" && "border-storefront-orange/40",
    design === "design3" && "bg-storefront-green-light border-transparent",
    design === "design4" && "border-storefront-border p-2",
    design === "design1" && "border-storefront-border"
  );

  return (
    <div className={wrapperClass}>
      <Link href={`/shop/product?slug=${product.slug}`} className="relative w-24 h-24 shrink-0 bg-storefront-bg flex items-center justify-center">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/${product.image}`} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-6 h-6 text-storefront-muted" />
        )}
        {design === "design2" && sale && offPct > 0 && (
          <span className="absolute top-0 left-0 bg-storefront-orange text-white text-[10px] font-bold px-2 py-0.5">{offPct}% OFF</span>
        )}
      </Link>
      <div className="flex-1 flex flex-col justify-center py-2 pr-2 min-w-0">
        <Link href={`/shop/product?slug=${product.slug}`} className="text-sm font-medium line-clamp-2">{product.name}</Link>

        {isCompact ? (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {sale && <span className="text-xs text-storefront-muted line-through">₹{price.toFixed(0)}</span>}
            <span className="font-bold text-sm">₹{(sale ?? price).toFixed(0)}</span>
            {sale && offAmount > 0 && <span className="text-[10px] bg-storefront-orange/10 text-storefront-orange font-bold rounded px-1.5 py-0.5">₹{offAmount} OFF</span>}
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-1.5 mt-1">
              {sale && <span className="text-xs text-storefront-muted line-through">₹{price.toFixed(0)}</span>}
              <span className="font-bold text-sm">₹{(sale ?? price).toFixed(0)}</span>
            </div>
            {design !== "design2" && sale && offAmount > 0 && (
              <span className="text-[10px] text-storefront-orange font-bold mt-0.5">₹{offAmount} OFF</span>
            )}
          </>
        )}

        <div className="mt-2">
          {outOfStock ? (
            <button disabled className="bg-storefront-muted text-white text-xs font-bold rounded px-3 py-1.5">UNAVAILABLE</button>
          ) : (
            <button
              onClick={() => addToCart(product.id)}
              disabled={adding}
              className="flex items-center gap-1 bg-storefront-green hover:bg-storefront-green-dark text-white text-xs font-bold rounded px-3 py-1.5 disabled:opacity-60"
            >
              <ShoppingCart className="w-3 h-3" /> ADD TO CART
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
