import { redirect } from "next/navigation";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { WishlistGrid } from "@/components/shop/pages/WishlistGrid";
import { Page } from "@/components/shop/ui/Meesho";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/db";
import { enrichProducts, publicProducts, FEED_SELECT, type FeedRow } from "@/lib/shop-feed";

/** Wishlist (Meesho product cards with live prices, ratings and Add to Cart). */
export default async function WishlistPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect(`/shop/login?redirect=${encodeURIComponent("/shop/wishlist")}`);

  const [layoutData, rows] = await Promise.all([
    getShopLayoutData(),
    prisma.ecomWishlist.findMany({ where: { customerId: customer.customerId, product: { status: "active" } }, orderBy: { createdAt: "desc" }, select: { product: { select: FEED_SELECT } } }),
  ]);
  const products = publicProducts(await enrichProducts(rows.map((r) => r.product as FeedRow)));

  return (
    <ShopLayout {...layoutData}>
      <Page title="My Wishlist" back="/shop/account">
        <WishlistGrid products={products} />
      </Page>
    </ShopLayout>
  );
}
