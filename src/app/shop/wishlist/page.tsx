import { redirect } from "next/navigation";
import Link from "next/link";
import { Heart } from "lucide-react";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { ProductCard } from "@/components/shop/ProductCard";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/db";

/** Verified against shop/wishlist.php. */
export default async function WishlistPage() {
  const customer = await getCustomerSession();
  if (!customer) redirect(`/shop/login?redirect=${encodeURIComponent("/shop/wishlist")}`);

  const layoutData = await getShopLayoutData();
  const wishlistItems = await prisma.ecomWishlist.findMany({
    where: { customerId: customer.customerId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <ShopLayout {...layoutData}>
      <h2 className="text-lg font-bold mb-4">My Wishlist</h2>

      {wishlistItems.length === 0 ? (
        <div className="text-center py-16 text-storefront-muted">
          <Heart className="w-10 h-10 mx-auto mb-3" />
          <p className="mb-3">Your wishlist is empty.</p>
          <Link href="/shop" className="inline-block bg-storefront-green hover:bg-storefront-green-dark text-white font-semibold rounded px-5 py-2.5">
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {wishlistItems.map((w: (typeof wishlistItems)[number]) => (
            <ProductCard
              key={w.id}
              product={{
                id: w.product.id, slug: w.product.slug, name: w.product.name, image: w.product.image,
                price: Number(w.product.price), salePrice: w.product.salePrice ? Number(w.product.salePrice) : null,
                productType: w.product.productType, stockQty: w.product.stockQty,
              }}
            />
          ))}
        </div>
      )}
    </ShopLayout>
  );
}
