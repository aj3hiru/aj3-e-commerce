"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { DEFAULT_PRODUCT_PAGE, type CartUi } from "@/types/product-page";

interface CartState {
  count: number;
  total: number;
  /** Cart lines: "productId" or "productId:sizeId" → qty. */
  items?: Record<string, number>;
}

interface CartContextValue {
  count: number;
  total: number;
  items: Record<string, number>;
  /** Increases on every add / qty change, so the floating bar can animate. */
  bump: number;
  ui: CartUi;
  setCart: (state: CartState, opts?: { animate?: boolean }) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Cart badge, per-product quantities (for the − / + steppers) and the
 * floating View Cart bar all read from here, so every consumer updates
 * together after an add-to-cart or quantity change.
 */
export function CartProvider({
  initialCount,
  initialTotal,
  initialItems = {},
  ui = DEFAULT_PRODUCT_PAGE.cart,
  children,
}: {
  initialCount: number;
  initialTotal: number;
  initialItems?: Record<string, number>;
  ui?: CartUi;
  children: React.ReactNode;
}) {
  const [state, setState] = useState({ count: initialCount, total: initialTotal, items: initialItems, bump: 0 });
  const setCart = useCallback((next: CartState, opts?: { animate?: boolean }) =>
    setState((s) => ({ count: next.count, total: next.total, items: next.items ?? s.items, bump: opts?.animate === false ? s.bump : s.bump + 1 })), []);

  return <CartContext.Provider value={{ ...state, ui, setCart }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}

/** Keys in the cart for one product (itself, or any of its sizes). */
export const productKeys = (items: Record<string, number>, productId: number) =>
  Object.keys(items).filter((k) => k === String(productId) || k.startsWith(`${productId}:`));
