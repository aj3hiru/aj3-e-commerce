import { ShopLayout } from "@/components/shop/ShopLayout";
import { CartTable } from "@/components/shop/CartTable";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCart } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import { effectivePrice } from "@/lib/shop-price";

/** Verified against shop/cart.php. */
export default async function CartPage() {
  const [layoutData, cart] = await Promise.all([getShopLayoutData(), getCart()]);

  const ids = Object.keys(cart).map(Number);
  const products = ids.length > 0 ? await prisma.ecomProduct.findMany({ where: { id: { in: ids } } }) : [];

  const items = products.map((p: (typeof products)[number]) => ({
    productId: p.id,
    slug: p.slug,
    name: p.name,
    image: p.image,
    unitPrice: effectivePrice(Number(p.price), p.salePrice ? Number(p.salePrice) : null),
    qty: cart[p.id] ?? 0,
  }));
  const subtotal = items.reduce((s: number, i: (typeof items)[number]) => s + i.unitPrice * i.qty, 0);

  return (
    <ShopLayout {...layoutData}>
      <h2 className="text-lg font-bold mb-4">Your Cart</h2>
      <CartTable items={items} subtotal={subtotal} />
    </ShopLayout>
  );
}
