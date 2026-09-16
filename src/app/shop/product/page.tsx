import { notFound } from "next/navigation";
import Link from "next/link";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { ProductActions, ReviewForm, StarRating } from "@/components/shop/ProductActions";
import { ProductCard } from "@/components/shop/ProductCard";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/db";

interface ProductPageProps {
  searchParams: Promise<{ slug?: string }>;
}

/** Verified against shop/product.php. */
export default async function ProductPage({ searchParams }: ProductPageProps) {
  const { slug } = await searchParams;
  const [layoutData, customer] = await Promise.all([getShopLayoutData(), getCustomerSession()]);

  const product = await prisma.ecomProduct.findFirst({ where: { slug: slug ?? "", status: "active" }, include: { images: { orderBy: { sortOrder: "asc" } }, brand: { select: { name: true } } } });
  if (!product) notFound();

  const [reviews, isWished, related] = await Promise.all([
    prisma.ecomProductReview.findMany({ where: { productId: product.id, status: "approved" }, orderBy: { createdAt: "desc" } }),
    customer ? prisma.ecomWishlist.findFirst({ where: { customerId: customer.customerId, productId: product.id } }) : null,
    product.categoryId
      ? prisma.ecomProduct.findMany({ where: { status: "active", categoryId: product.categoryId, id: { not: product.id } }, take: 4 })
      : Promise.resolve([]),
  ]);

  const avgRating = reviews.length > 0 ? reviews.reduce((s: number, r: (typeof reviews)[number]) => s + r.rating, 0) / reviews.length : 0;
  const price = Number(product.price);
  const sale = product.salePrice && Number(product.salePrice) > 0 && Number(product.salePrice) < price ? Number(product.salePrice) : null;
  const outOfStock = product.productType === "physical" && (product.stockQty ?? 0) <= 0;

  const galleryImages = [product.image, ...product.images.map((i: (typeof product.images)[number]) => i.image)].filter((x): x is string => !!x);

  return (
    <ShopLayout {...layoutData}>
      <nav className="text-xs text-storefront-muted mb-3">
        <Link href="/shop" className="text-storefront-muted">Home</Link> / <span className="text-storefront-text">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-[5fr_7fr] gap-8 mb-10">
        <ProductGallery images={galleryImages} name={product.name} />

        <div>
          {product.brand && <div className="text-storefront-muted text-sm mb-1">{product.brand.name}</div>}
          <h1 className="text-2xl font-bold mb-2">{product.name}</h1>

          {reviews.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <StarRating value={avgRating} />
              <span className="text-storefront-muted text-sm">({reviews.length} review{reviews.length === 1 ? "" : "s"})</span>
            </div>
          )}

          <div className="mb-3">
            <span className="text-2xl font-bold">₹{(sale ?? price).toFixed(2)}</span>
            {sale && (
              <>
                <span className="text-storefront-muted line-through text-lg ml-2">₹{price.toFixed(2)}</span>
                <span className="bg-red-500 text-white text-xs font-bold rounded px-2 py-1 ml-2">{Math.round((1 - sale / price) * 100)}% OFF</span>
              </>
            )}
          </div>

          {product.description && <p className="text-storefront-muted whitespace-pre-line mb-3">{product.description}</p>}

          {product.productType === "physical" && (
            <p className="mb-3 text-sm">
              {outOfStock ? (
                <span className="text-red-600 font-bold">Out of Stock</span>
              ) : (
                <><span className="text-emerald-600 font-bold">In Stock</span> ({product.stockQty} available)</>
              )}
            </p>
          )}

          <ProductActions productId={product.id} outOfStock={outOfStock} isWished={!!isWished} isLoggedIn={!!customer} />
        </div>
      </div>

      <div className="mb-10">
        <h4 className="font-bold text-lg mb-3">Customer Reviews</h4>
        {reviews.length === 0 ? (
          <p className="text-storefront-muted text-sm">No reviews yet — be the first to review this product!</p>
        ) : (
          <div className="divide-y divide-storefront-border">
            {reviews.map((r: (typeof reviews)[number]) => (
              <div key={r.id} className="py-3">
                <div className="flex justify-between items-center">
                  <strong className="text-sm">{r.customerName}</strong>
                  <StarRating value={r.rating} />
                </div>
                {r.reviewText && <p className="text-storefront-muted text-sm mt-1">{r.reviewText}</p>}
              </div>
            ))}
          </div>
        )}
        <ReviewForm productId={product.id} isLoggedIn={!!customer} />
      </div>

      {related.length > 0 && (
        <div>
          <h4 className="font-bold text-lg mb-3">You May Also Like</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {related.map((p: (typeof related)[number]) => (
              <ProductCard
                key={p.id}
                product={{ id: p.id, slug: p.slug, name: p.name, image: p.image, price: Number(p.price), salePrice: p.salePrice ? Number(p.salePrice) : null, productType: p.productType, stockQty: p.stockQty }}
              />
            ))}
          </div>
        </div>
      )}
    </ShopLayout>
  );
}
