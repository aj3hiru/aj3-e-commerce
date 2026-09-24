import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { campaignSalePrices } from "@/lib/campaign-pricing";

const PAGE_SIZE = 20;

/** Verified against the load_more_category_products action in shop/ajax.php.
 *  Returns plain JSON product data (rendered client-side by ProductCard) rather
 *  than server-rendered HTML — the React equivalent of the PHP's ob_start()
 *  HTML-string response. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const int = (v: string | null) => Math.max(0, Math.floor(Number(v ?? 0)) || 0); // NaN/garbage -> 0
  const categoryId = int(searchParams.get("category_id"));
  const subcategoryId = int(searchParams.get("subcategory_id"));
  const offset = int(searchParams.get("offset"));

  const where = subcategoryId > 0 ? { status: "active", subcategoryId } : { status: "active", categoryId };

  const [products, total] = await Promise.all([
    prisma.ecomProduct.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE_SIZE, skip: offset }),
    prisma.ecomProduct.count({ where }),
  ]);
  const campaign = await campaignSalePrices(products); // campaign prices, when a campaign is live

  return NextResponse.json({
    success: true,
    products: products.map((p: (typeof products)[number]) => ({
      id: p.id, slug: p.slug, name: p.name, image: p.image,
      price: Number(p.price), salePrice: campaign.get(p.id) ?? (p.salePrice ? Number(p.salePrice) : null),
      productType: p.productType, stockQty: p.stockQty,
    })),
    count: products.length,
    has_more: offset + products.length < total,
  });
}
