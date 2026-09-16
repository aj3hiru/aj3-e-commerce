"use client";

import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { useAddToCart } from "@/hooks/useAddToCart";
import type { ProductCardData } from "./ProductCard";

/**
 * Verified against renderCard2Product() AND its CSS (shop-header.php lines
 * 570-646) — rebuilt after a careful re-check found several real mismatches
 * in the first pass:
 *
 * 1. Design name mapping was wrong. The admin picker's design3/design4 do NOT
 *    map to CSS classes "design3"/"design4" — the PHP explicitly remaps them:
 *    design1→design1, design2→design2, design3→design4 (two-tone), design4→design5
 *    (compact chip). Using the admin-facing name directly on the CSS class,
 *    as the first pass did, would have picked the wrong visual style for
 *    "design3" and "design4".
 * 2. design2's ribbon shows a PERCENTAGE off ("23% OFF"), not a rupee amount —
 *    the first pass showed a rupee-amount ribbon.
 * 3. The bottom row is TWO separate elements — a `qty2` info box (shows
 *    "In Stock" / "Out of stock", not a quantity stepper despite the class
 *    name) AND a separate `cart2` add-to-cart button — not one merged button
 *    as the first pass had it.
 * 4. The out-of-stock button says "UNAVAILABLE", not the design1 card's
 *    "OUT OF STOCK" — a small but real copy difference between the two card
 *    families that's worth preserving.
 */
export function Card2Product({ product, design = "design1" }: { product: ProductCardData; design?: "design1" | "design2" | "design3" | "design4" }) {
  const { addToCart, adding } = useAddToCart();
  const price = product.price;
  const sale = product.salePrice && product.salePrice > 0 && product.salePrice < price ? product.salePrice : null;
  const outOfStock = product.productType === "physical" && (product.stockQty ?? 0) <= 0;
  const offAmount = sale ? Math.round(price - sale) : 0;
  const offPct = sale && price > 0 ? Math.round(((price - sale) / price) * 100) : 0;

  // Real CSS-class remap verified from the PHP: design3→design4 (two-tone),
  // design4→design5 (compact chip) — NOT a 1:1 name match.
  const cssDesign = { design1: "design1", design2: "design2", design3: "design4", design4: "design5" }[design];
  const isCompact = design === "design4"; // admin-facing "design4" = compact chip = CSS "design5"
  const isTwoTone = design === "design3"; // admin-facing "design3" = two-tone = CSS "design4"

  return (
    <div
      className={
        isTwoTone
          ? "border border-storefront-border rounded-[10px] overflow-hidden flex flex-col bg-white"
          : "border border-storefront-border rounded-[10px] p-3.5 flex flex-col gap-3 bg-white"
      }
    >
      <div className={isTwoTone ? "flex gap-3.5 p-3.5" : "flex gap-3.5"} style={isCompact ? { gap: "10px" } : undefined}>
        <Link
          href={`/shop/product?slug=${product.slug}`}
          className="relative shrink-0 bg-[#fafafa] rounded-lg flex items-center justify-center overflow-hidden"
          style={isCompact ? { width: 70, height: 70 } : { width: 100, height: 100 }}
        >
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/${product.image}`} alt={product.name} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <ImageIcon className="w-6 h-6 text-storefront-muted" />
          )}
          {design === "design2" && sale && offPct > 0 && (
            <span className="absolute top-2 -left-1.5 bg-[#c62828] text-white text-[10px] font-bold px-2.5 py-1 rounded-[2px_6px_6px_2px] shadow">
              {offPct}% OFF
            </span>
          )}
        </Link>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5 justify-center">
          <Link href={`/shop/product?slug=${product.slug}`} className={isCompact ? "text-[13px] font-semibold leading-snug text-[#1a1a1a]" : "text-sm font-semibold leading-snug text-[#1a1a1a]"}>
            {product.name}
          </Link>

          {isCompact ? (
            <div className="flex items-center gap-1.5 flex-wrap text-[13px]">
              {sale && <span className="line-through text-storefront-muted">₹{price.toFixed(0)}</span>}
              <span className="font-extrabold text-base text-[#111]">₹{(sale ?? price).toFixed(0)}</span>
              {sale && offAmount > 0 && (
                <span className="inline-block w-fit bg-storefront-green-light text-storefront-green-dark font-bold text-[10px] px-1.5 py-0.5 rounded">
                  ₹{offAmount} OFF
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap text-[13px]">
                {sale && <span className="line-through text-storefront-muted">₹{price.toFixed(0)}</span>}
                <span className="font-extrabold text-base text-[#111]">₹{(sale ?? price).toFixed(0)}</span>
              </div>
              {design !== "design2" && sale && offAmount > 0 && (
                <span className="inline-block w-fit bg-storefront-green-light text-storefront-green-dark font-bold text-[11px] px-2 py-0.5 rounded">
                  ₹{offAmount} OFF
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div
        className={isTwoTone ? "flex items-center gap-2.5 w-full bg-storefront-green-light px-3.5 py-3" : "flex items-center gap-2.5 w-full"}
      >
        {outOfStock ? (
          <>
            <div
              className={isTwoTone ? "border border-storefront-border rounded-md px-3 py-2 text-[12.5px] flex-shrink-0 flex flex-col justify-center bg-white" : "border border-storefront-border rounded-md px-3 py-2 text-[12.5px] flex-shrink-0 flex flex-col justify-center"}
              style={{ width: isCompact ? 60 : 110, height: 44 }}
            >
              Out of stock
            </div>
            <button disabled className="flex-1 h-11 bg-storefront-muted text-white rounded-md font-bold text-[12.5px]">UNAVAILABLE</button>
          </>
        ) : (
          <>
            <div
              className={isTwoTone ? "border border-storefront-border rounded-md px-3 py-2 text-[12.5px] flex-shrink-0 flex flex-col justify-center bg-white" : "border border-storefront-border rounded-md px-3 py-2 text-[12.5px] flex-shrink-0 flex flex-col justify-center"}
              style={isCompact ? { width: 60, height: 44, alignItems: "center", justifyContent: "center", fontWeight: 700 } : { width: 110, height: 44 }}
            >
              In Stock
              {!isCompact && <small className="block text-storefront-muted text-[10.5px] mt-0.5">Ready to ship</small>}
            </div>
            <button
              onClick={() => addToCart(product.id)}
              disabled={adding}
              className={isCompact ? "flex-1 h-11 min-w-0 bg-storefront-green text-white rounded-md font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60" : "h-11 min-w-0 bg-storefront-green text-white rounded-md font-bold text-[12.5px] flex items-center justify-center gap-1.5 disabled:opacity-60"}
              style={!isCompact ? { width: 150, flex: "0 0 auto" } : undefined}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="#fff" strokeWidth="2">
                <circle cx="9" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
                <path d="M2 3h2l2.6 12.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L22 7H6" />
              </svg>
              ADD TO CART
            </button>
          </>
        )}
      </div>
    </div>
  );
}
