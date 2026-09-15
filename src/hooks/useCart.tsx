"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface CartState {
  count: number;
  total: number;
}

interface CartContextValue extends CartState {
  setCart: (state: CartState) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Replaces the original inline script in shop-footer.php that queried every
 * .cart-badge element on the page and updated them directly via the DOM
 * after a successful /shop/ajax.php add_to_cart response. Here, the same
 * effect is achieved through React context so every consumer (desktop
 * topbar, mobile topbar) re-renders together.
 */
export function CartProvider({
  initialCount,
  initialTotal,
  children,
}: {
  initialCount: number;
  initialTotal: number;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CartState>({ count: initialCount, total: initialTotal });
  const setCart = useCallback((next: CartState) => setState(next), []);

  return <CartContext.Provider value={{ ...state, setCart }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
