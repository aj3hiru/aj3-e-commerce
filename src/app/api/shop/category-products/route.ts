import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 20;

/** Verified against the load_more_category_products action in shop/ajax.php.
 *  Returns plain JSON product data (rendered client-side by ProductCard) rather
 *  than server-rendered HTML — the React equivalent of the PHP's ob_start()
 *  HTML-string response. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = Number(searchParams.get("category_id") ?? 0);
  const subcategoryId = Number(searchParams.get("subcategory_id") ?? 0);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  const where = subcategoryId > 0 ? { status: "active", subcategoryId } : { status: "active", categoryId };

  const [products, total] = await Promise.all([
    prisma.ecomProduct.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE_SIZE, skip: offset }),
    prisma.ecomProduct.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    products: products.map((p: (typeof products)[number]) => ({
      id: p.id, slug: p.slug, name: p.name, image: p.image,
      price: Number(p.price), salePrice: p.salePrice ? Number(p.salePrice) : null,
      productType: p.productType, stockQty: p.stockQty,
    })),
    count: products.length,
    has_more: offset + products.length < total,
  });
}
