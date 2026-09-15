"use client";

import Link from "next/link";
import { ImageIcon, ShoppingCart } from "lucide-react";
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

/** Verified against renderCmartProductCard() in product-card.php — the standard
 *  vertical product card used across category pages and auto-generated home rows. */
export function ProductCard({ product }: { product: ProductCardData }) {
  const { addToCart, adding } = useAddToCart();
  const sale = product.salePrice && product.salePrice > 0 && product.salePrice < product.price ? product.salePrice : null;
  const outOfStock = product.productType === "physical" && (product.stockQty ?? 0) <= 0;
  const offAmount = sale ? Math.round(product.price - sale) : 0;

  return (
    <div className="border border-storefront-border rounded-lg bg-white overflow-hidden flex flex-col">
      <Link href={`/shop/product?slug=${product.slug}`} className="relative aspect-square bg-storefront-bg flex items-center justify-center">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/${product.image}`} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-8 h-8 text-storefront-muted" />
        )}
        {sale && offAmount > 0 && (
          <span className="absolute top-1.5 right-1.5 bg-storefront-orange text-white text-[10px] font-bold rounded px-1.5 py-0.5">
            ₹{offAmount} OFF
          </span>
        )}
      </Link>
      <Link href={`/shop/product?slug=${product.slug}`} className="px-2.5 pt-2 text-sm font-medium line-clamp-2 min-h-[2.5em]">
        {product.name}
      </Link>
      <div className="flex items-center justify-between px-2.5 mt-1.5">
        <div className="flex items-baseline gap-1.5">
          {sale && <span className="text-xs text-storefront-muted line-through">₹{product.price.toFixed(0)}</span>}
          <span className="font-bold text-storefront-text">₹{(sale ?? product.price).toFixed(0)}</span>
        </div>
      </div>
      <div className="p-2.5 mt-auto">
        {outOfStock ? (
          <button disabled className="w-full bg-storefront-muted text-white text-xs font-bold rounded py-2">OUT OF STOCK</button>
        ) : (
          <button
            onClick={() => addToCart(product.id)}
            disabled={adding}
            className="w-full flex items-center justify-center gap-1.5 bg-storefront-green hover:bg-storefront-green-dark text-white text-xs font-bold rounded py-2 disabled:opacity-60"
          >
            <ShoppingCart className="w-3.5 h-3.5" /> ADD TO CART
          </button>
        )}
      </div>
    </div>
  );
}
