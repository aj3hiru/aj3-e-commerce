import { cookies } from "next/headers";

const CART_COOKIE = "shop_cart";
const CART_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type CartMap = Record<number, number>; // productId -> qty

/**
 * Re-implements $_SESSION['shop_cart'] from shop/ajax.php as a signed,
 * httpOnly cookie (a simple JSON map of productId -> qty). Next.js API routes
 * are stateless between requests — there is no direct PHP-session equivalent
 * — so the cart state itself now lives in the cookie rather than server memory.
 */
export async function getCart(): Promise<CartMap> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CART_COOKIE)?.value;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
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
