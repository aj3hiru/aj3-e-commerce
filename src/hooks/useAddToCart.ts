"use client";

import { useState } from "react";
import { useCart } from "./useCart";

export function useAddToCart() {
  const { setCart } = useCart();
  const [adding, setAdding] = useState(false);

  async function addToCart(productId: number, qty = 1, sizeId: number | null = null, opts: { silent?: boolean } = {}) {
    setAdding(true);
    try {
      const res = await fetch("/api/shop/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_to_cart", product_id: productId, size_id: sizeId, qty }),
      });
      const data = await res.json();
      if (data.success) {
        setCart({ count: data.cart_count, total: data.cart_total });
      } else if (!opts.silent) {
        alert(data.message || "Could not add to cart.");
      }
      return data;
    } finally {
      setAdding(false);
    }
  }

  return { addToCart, adding };
}
