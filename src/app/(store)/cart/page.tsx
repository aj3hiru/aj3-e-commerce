import { ShopLayout } from "@/components/shop/ShopLayout";
import { CartView } from "@/components/shop/pages/CartView";
import { Page, Steps } from "@/components/shop/ui/Meesho";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCart } from "@/lib/cart-session";
import { loadCartLines } from "@/lib/cart-lines";

/** Cart (Meesho style): lines are per product, or per product size. */
export default async function CartPage() {
  const [layoutData, cart] = await Promise.all([getShopLayoutData(), getCart()]);
  const lines = await loadCartLines(cart);
  const items = lines.map((l) => ({
    key: l.key, slug: l.product.slug, name: l.product.name, size: l.size?.label ?? null, image: l.product.image,
    unitPrice: l.unitPrice, mrp: l.mrp, qty: l.qty, maxQty: l.maxQty,
  }));

  return (
    <ShopLayout {...layoutData}>
      <Page title="Cart" back="/" steps={items.length ? <Steps active={0} /> : undefined}>
        <CartView key={JSON.stringify(items.map((i) => [i.key, i.qty, i.unitPrice]))} items={items} />
      </Page>
    </ShopLayout>
  );
}
