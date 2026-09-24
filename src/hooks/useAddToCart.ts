"use client";

import { useState } from "react";
import { useCart } from "./useCart";

type CartResponse = { success: boolean; message?: string; cart_count: number; cart_total: number; items?: Record<string, number>; key?: string };

async function post(body: Record<string, unknown>): Promise<CartResponse | null> {
  return fetch("/api/shop/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch(() => null);
}

export function useAddToCart() {
  const { setCart } = useCart();
  const [adding, setAdding] = useState(false);

  async function addToCart(productId: number, qty = 1, sizeId: number | null = null, opts: { silent?: boolean } = {}) {
    setAdding(true);
    try {
      const data = await post({ action: "add_to_cart", product_id: productId, size_id: sizeId, qty });
      if (data?.success) {
        setCart({ count: data.cart_count, total: data.cart_total, items: data.items });
      } else if (!opts.silent) {
        alert(data?.message || "Could not add to cart.");
      }
      return data;
    } finally {
      setAdding(false);
    }
  }

  /** Set a cart line's quantity (0 removes it). */
  async function setQty(key: string, qty: number) {
    setAdding(true);
    try {
      const data = await post({ action: "update_cart_qty", key, qty });
      if (data?.success) setCart({ count: data.cart_count, total: data.cart_total, items: data.items });
      return data;
    } finally {
      setAdding(false);
    }
  }

  return { addToCart, setQty, adding };
}
