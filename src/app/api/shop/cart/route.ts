import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCart, setCart, cartCount, cartKey, parseCartKey, type CartMap } from "@/lib/cart-session";
import { cartTotal, loadCartLines, priceLine, type CartProduct, type CartSize } from "@/lib/cart-lines";
import { loadLiveCampaigns } from "@/lib/campaign-pricing";
import { withApiErrors } from "@/lib/api-errors";

const summary = async (cart: CartMap) => ({ cart_count: cartCount(cart), cart_total: cartTotal(await loadCartLines(cart)), items: cart });

/** GET the current cart (for hydrating the header cart badge on load). */
async function handleGET() {
  const cart = await getCart();
  return NextResponse.json({ success: true, ...(await summary(cart)) });
}

/** Line key from the request: `key` ("12" / "12:5") or product_id (+ size_id). */
function keyFrom(body: Record<string, unknown>): string | null {
  if (typeof body.key === "string") return parseCartKey(body.key) ? body.key : null;
  const pid = Number(body.product_id ?? 0);
  const sid = body.size_id === undefined || body.size_id === null || body.size_id === "" ? null : Number(body.size_id);
  if (!Number.isInteger(pid) || pid <= 0 || (sid !== null && (!Number.isInteger(sid) || sid <= 0))) return null;
  return cartKey(pid, sid);
}

/** Loads a product (+ size) that can be sold, with its stock limit. */
async function sellable(key: string) {
  const k = parseCartKey(key)!;
  const product = (await prisma.ecomProduct.findFirst({
    where: { id: k.productId, status: "active" },
    select: { id: true, slug: true, name: true, image: true, price: true, salePrice: true, stockQty: true, productType: true, categoryId: true, subcategoryId: true, brandId: true, gstRate: true, hsnCode: true, status: true },
  })) as CartProduct | null;
  if (!product) return { error: "Product not found." } as const;
  const sizeSelect = { id: true, productId: true, label: true, mrp: true, price: true, stockQty: true } as const;
  let size: CartSize | null = null;
  if (k.sizeId) {
    size = (await prisma.ecomProductSize.findFirst({ where: { id: k.sizeId, productId: product.id }, select: sizeSelect })) as CartSize | null;
    if (!size) return { error: "That size is no longer available." } as const;
  } else {
    // A product sold in sizes, added from a list without choosing one: use its
    // default size — the one whose price the lists show.
    size = (await prisma.ecomProductSize.findFirst({ where: { productId: product.id }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { id: "asc" }], select: sizeSelect })) as CartSize | null;
  }
  const { maxQty } = priceLine(product, size, await loadLiveCampaigns().catch(() => []), new Date());
  return { key: cartKey(product.id, size?.id), product, size, maxQty } as const;
}

/** Verified against add_to_cart / update_cart_qty / remove_from_cart in shop/ajax.php (plus sizes). */
async function handlePOST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action as string;
  const cart = await getCart();
  const key = keyFrom(body);

  if (action === "add_to_cart") {
    const qty = toQty(body.qty ?? 1) || 1;
    if (!key) return NextResponse.json({ success: false, message: "Invalid product." });
    const s = await sellable(key);
    if ("error" in s) return NextResponse.json({ success: false, message: s.error });
    let newQty = (cart[s.key] ?? 0) + qty;
    if (s.maxQty !== null) {
      if (s.maxQty <= 0) return NextResponse.json({ success: false, message: "Out of stock." });
      newQty = Math.min(newQty, s.maxQty);
    }
    cart[s.key] = newQty;
    await setCart(cart);
    return NextResponse.json({ success: true, key: s.key, qty: newQty, ...(await summary(cart)) });
  }

  if (action === "update_cart_qty") {
    if (!key) return NextResponse.json({ success: false, message: "Invalid product." });
    let qty = toQty(body.qty ?? 1);
    if (qty > 0) {
      const s = await sellable(key);
      if ("error" in s) qty = 0;
      else if (s.maxQty !== null) qty = Math.min(qty, s.maxQty);
    }
    if (qty === 0) delete cart[key];
    else cart[key] = qty;
    await setCart(cart);
    return NextResponse.json({ success: true, ...(await summary(cart)) });
  }

  if (action === "remove_from_cart") {
    if (key) delete cart[key];
    await setCart(cart);
    return NextResponse.json({ success: true, ...(await summary(cart)) });
  }

  return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
}

function toQty(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 0;
}

export const GET = withApiErrors(handleGET);
export const POST = withApiErrors(handlePOST);
