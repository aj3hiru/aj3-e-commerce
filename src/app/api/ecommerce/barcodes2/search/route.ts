import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { BARCODE_SELECT, toBarcodeProduct, type BarcodeProduct } from "@/lib/barcodes2";

/**
 * GET /api/ecommerce/barcodes2/search?q=...&category=...&limit=...
 *
 * Used by the "add a product" box on /admin/ecommerce/barcode-print. The page
 * deliberately doesn't hold every product in the browser (a shop can have
 * thousands), so searching asks the server and gets back a small page.
 */
const MAX = 50;

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (
    !session ||
    (!hasPermission(session.permissions, "ecommerce", "manage_products") &&
      !hasPermission(session.permissions, "ecommerce", "manage_billing"))
  ) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const categoryRaw = sp.get("category");
  const categoryId = categoryRaw && /^\d+$/.test(categoryRaw) ? Number(categoryRaw) : null;
  const missingOnly = sp.get("missing") === "1";

  if (q.length < 2 && categoryId === null && !missingOnly) {
    return NextResponse.json({ success: true, products: [] });
  }

  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }];
  if (categoryId !== null) where.categoryId = categoryId;
  if (missingOnly) where.AND = [{ OR: [{ barcode: null }, { barcode: "" }] }];

  try {
    const rows = await prisma.ecomProduct.findMany({ where, orderBy: { name: "asc" }, take: MAX, select: BARCODE_SELECT });
    // Dates only decide the "new"/"updated" chips, which the search list doesn't show.
    const products: BarcodeProduct[] = (rows as Parameters<typeof toBarcodeProduct>[0][]).map((p) => toBarcodeProduct(p, 0, 0));
    return NextResponse.json({ success: true, products });
  } catch (e) {
    console.error("barcode search failed", e);
    return NextResponse.json({ success: false, message: "Could not search products. Please try again." }, { status: 500 });
  }
}
