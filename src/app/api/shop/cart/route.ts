import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCart, setCart, cartCount } from "@/lib/cart-session";
import { campaignSalePrices } from "@/lib/campaign-pricing";

async function computeCartTotal(cart: Record<number, number>): Promise<number> {
  const ids = Object.keys(cart).map(Number);
  if (ids.length === 0) return 0;
  const products = await prisma.ecomProduct.findMany({ where: { id: { in: ids } }, select: { id: true, price: true, salePrice: true, categoryId: true, brandId: true } });
  const campaign = await campaignSalePrices(products); // campaign prices, so the badge matches the cart
  let total = 0;
  for (const p of products) {
    const sale = p.salePrice ? Number(p.salePrice) : 0;
    const price = Number(p.price);
    const unit = campaign.get(p.id) ?? (sale > 0 && sale < price ? sale : price);
    total += unit * (cart[p.id] ?? 0);
  }
  return total;
}

/** GET the current cart (for hydrating the header cart badge on load). */
export async function GET() {
  const cart = await getCart();
  const total = await computeCartTotal(cart);
  return NextResponse.json({ success: true, cart_count: cartCount(cart), cart_total: total, items: cart });
}

/** Verified against add_to_cart / update_cart_qty / remove_from_cart in shop/ajax.php. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const cart = await getCart();

  if (action === "add_to_cart") {
    const pid = Number(body.product_id ?? 0);
    const qty = Math.max(1, Number(body.qty ?? 1));
    if (pid <= 0) return NextResponse.json({ success: false, message: "Invalid product." });

    const product = await prisma.ecomProduct.findFirst({ where: { id: pid, status: "active" }, select: { id: true, stockQty: true, productType: true } });
    if (!product) return NextResponse.json({ success: false, message: "Product not found." });

    const current = cart[pid] ?? 0;
    let newQty = current + qty;
    if (product.productType === "physical" && product.stockQty !== null) {
      if (newQty > product.stockQty) newQty = Math.max(1, product.stockQty);
      if (newQty <= 0) return NextResponse.json({ success: false, message: "Out of stock." });
    }

    cart[pid] = newQty;
    await setCart(cart);
    const total = await computeCartTotal(cart);
    return NextResponse.json({ success: true, cart_count: cartCount(cart), cart_total: total });
  }

  if (action === "update_cart_qty") {
    const pid = Number(body.product_id ?? 0);
    const qty = Math.max(0, Number(body.qty ?? 1));
    if (qty === 0) delete cart[pid];
    else cart[pid] = qty;
    await setCart(cart);
    const total = await computeCartTotal(cart);
    return NextResponse.json({ success: true, cart_count: cartCount(cart), cart_total: total });
  }

  if (action === "remove_from_cart") {
    const pid = Number(body.product_id ?? 0);
    delete cart[pid];
    await setCart(cart);
    const total = await computeCartTotal(cart);
    return NextResponse.json({ success: true, cart_count: cartCount(cart), cart_total: total });
  }

  return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
}
