import { ShopLayout } from "@/components/shop/ShopLayout";
import { CartTable } from "@/components/shop/CartTable";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCart } from "@/lib/cart-session";
import { cartTotal, loadCartLines } from "@/lib/cart-lines";

/** Verified against shop/cart.php (lines are per product, or per product size). */
export default async function CartPage() {
  const [layoutData, cart] = await Promise.all([getShopLayoutData(), getCart()]);
  const lines = await loadCartLines(cart);
  const items = lines.map((l) => ({ key: l.key, productId: l.product.id, slug: l.product.slug, name: l.name, image: l.product.image, unitPrice: l.unitPrice, qty: l.qty }));

  return (
    <ShopLayout {...layoutData}>
      <h2 className="text-lg font-bold mb-4">Your Cart</h2>
      <CartTable items={items} subtotal={cartTotal(lines)} />
    </ShopLayout>
  );
}
