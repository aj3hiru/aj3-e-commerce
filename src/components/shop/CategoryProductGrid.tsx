"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProductCard, type ProductCardData } from "./ProductCard";

interface CategoryProductGridProps {
  initialProducts: ProductCardData[];
  hasMore: boolean;
  categoryId: number;
  subcategoryId: number | null;
}

export function CategoryProductGrid({ initialProducts, hasMore: initialHasMore, categoryId, subcategoryId }: CategoryProductGridProps) {
  const [products, setProducts] = useState(initialProducts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [offset, setOffset] = useState(initialProducts.length);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        category_id: String(categoryId),
        subcategory_id: String(subcategoryId ?? ""),
        offset: String(offset),
      });
      const res = await fetch(`/api/shop/category-products?${params}`);
      const data = await res.json();
      if (data.success) {
        setProducts((prev) => [...prev, ...data.products]);
        setOffset((prev) => prev + data.count);
        setHasMore(data.has_more);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div id="categoryProductGrid" className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {hasMore && (
        <div className="text-center mt-4">
          <button
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-white border border-storefront-green text-storefront-green-dark text-sm font-bold rounded-full px-6 py-2.5 disabled:opacity-60"
          >
            {loading ? "Loading…" : "See More"} <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
