"use client";

import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { useAddToCart } from "@/hooks/useAddToCart";

export interface ProductCardData {
  id: number;
  slug: string;
  name: string;
  image: string | null;
  price: number;
  salePrice: number | null;
  productType: string;
  stockQty: number | null;
}

/**
 * Verified against renderCmartProductCard() AND its CSS in shop-header.php
 * (lines 473-554) — corrected after an initial pass had gotten the discount
 * badge color wrong (was orange, should be green-light bg / green-dark text)
 * and was missing the "MRP" label entirely. Also corrected the badge
 * responsive behavior: the corner badge is `display:none` on desktop and
 * only shown on mobile (`.off-badge-corner` override in the mobile media
 * query); the inline badge is the reverse (`.off-badge-inline{display:none}`
 * on mobile). Both badges show the same "OFF" text — CSS just picks which
 * one is visible per breakpoint, so both are rendered here with Tailwind's
 * responsive utilities doing the same job.
 */
export function ProductCard({ product }: { product: ProductCardData }) {
  const { addToCart, adding } = useAddToCart();
  const sale = product.salePrice && product.salePrice > 0 && product.salePrice < product.price ? product.salePrice : null;
  const outOfStock = product.productType === "physical" && (product.stockQty ?? 0) <= 0;
  const offAmount = sale ? Math.round(product.price - sale) : 0;

  return (
    <div className="border border-storefront-border rounded-lg p-4 flex flex-col gap-2.5 relative bg-white">
      <Link href={`/shop/product?slug=${product.slug}`} className="relative h-[130px] flex items-center justify-center bg-[#fafafa] rounded-md overflow-hidden">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/${product.image}`} alt={product.name} className="w-full h-full object-cover rounded-md" />
        ) : (
          <ImageIcon className="w-8 h-8 text-storefront-muted" />
        )}
        {sale && offAmount > 0 && (
          <span className="sm:hidden absolute top-1.5 right-1.5 bg-storefront-orange text-white text-[10px] font-bold rounded px-1.5 py-0.5">
            ₹{offAmount} OFF
          </span>
        )}
      </Link>

      <Link href={`/shop/product?slug=${product.slug}`} className="text-sm font-semibold leading-snug line-clamp-2">
        {product.name}
      </Link>

      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] flex items-baseline flex-wrap">
          <span className="text-storefront-muted text-[11px] mr-1">MRP</span>
          {sale && <span className="line-through text-storefront-muted mr-1.5">₹{product.price.toFixed(0)}</span>}
          <span className="font-extrabold text-base text-storefront-text">₹{(sale ?? product.price).toFixed(0)}</span>
        </div>
        {sale && offAmount > 0 && (
          <div className="hidden sm:block bg-storefront-green-light text-storefront-green-dark font-bold text-[13px] rounded px-2.5 py-1.5 text-center leading-tight whitespace-nowrap">
            ₹{offAmount}<small className="font-semibold text-[11px] ml-0.5">OFF</small>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {outOfStock ? (
          <button disabled className="flex-1 h-11 bg-storefront-muted text-white rounded-md font-bold text-[12.5px]">OUT OF STOCK</button>
        ) : (
          <button
            onClick={() => addToCart(product.id)}
            disabled={adding}
            className="flex-1 h-11 min-w-0 bg-storefront-green text-white rounded-md font-bold text-[12.5px] flex items-center justify-center gap-1.5 px-1.5 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="#fff" strokeWidth="2">
              <circle cx="9" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
              <path d="M2 3h2l2.6 12.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L22 7H6" />
            </svg>
            ADD TO CART
          </button>
        )}
      </div>
    </div>
  );
}
