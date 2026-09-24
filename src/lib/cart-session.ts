import { cookies } from "next/headers";

const CART_COOKIE = "shop_cart";
const CART_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type CartMap = Record<number, number>; // productId -> qty

/**
 * Re-implements $_SESSION['shop_cart'] from shop/ajax.php as an (unsigned)
 * httpOnly cookie (a simple JSON map of productId -> qty). Next.js API routes
 * are stateless between requests — there is no direct PHP-session equivalent
 * — so the cart state itself now lives in the cookie rather than server memory.
 */
export async function getCart(): Promise<CartMap> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CART_COOKIE)?.value;
  if (!raw) return {};
  try {
    // The cookie is client-editable, so keep only positive whole quantities
    // for positive integer product ids — prices/stock are re-checked at checkout anyway.
    const parsed = JSON.parse(raw);
    const cart: CartMap = {};
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        const id = Number(k);
        const qty = Math.floor(Number(v));
        if (Number.isInteger(id) && id > 0 && Number.isFinite(qty) && qty > 0) cart[id] = Math.min(qty, 999);
      }
    }
    return cart;
  } catch {
    return {};
  }
}

export async function setCart(cart: CartMap): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CART_COOKIE, JSON.stringify(cart), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: CART_MAX_AGE,
    path: "/",
  });
}

export function cartCount(cart: CartMap): number {
  return Object.values(cart).reduce((s, q) => s + q, 0);
}
