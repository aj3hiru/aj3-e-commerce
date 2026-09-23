import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";

const MAX_QTY = 2_147_483_647; // the stock columns are 32-bit integers

/**
 * PUT /api/ecommerce/stock-out2/[id] — used by /admin/ecommerce/stock-out-products.
 *
 * Updates a physical product's stock and, in the same request, the stock of
 * any of its Sizes / Units (EcomProductSize). Both parts are optional:
 *   { qty?: number, sizes?: { id: number, stockQty: number | null }[] }
 *
 *  - qty       new product stock (whole number, 0 or more). Left out = unchanged.
 *  - sizes     only the units whose stock changed. stockQty null = "not tracked".
 *
 * Everything is written in one transaction, so the product and its units are
 * never left half-updated. Units are updated by id, so they keep their id,
 * price, MRP and order (unlike saving the whole product form, which
 * recreates them).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const productId = Number((await params).id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ success: false, message: "Invalid product id" }, { status: 400 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
  const { qty: qtyRaw, sizes: sizesRaw } = body as { qty?: unknown; sizes?: unknown };

  const bad = (message: string) => NextResponse.json({ success: false, message }, { status: 400 });

  let qty: number | undefined;
  if (qtyRaw !== undefined && qtyRaw !== null) {
    if (typeof qtyRaw !== "number" || !Number.isInteger(qtyRaw) || qtyRaw < 0 || qtyRaw > MAX_QTY) {
      return bad("Stock must be a whole number, 0 or more.");
    }
    qty = qtyRaw;
  }

  const sizeUpdates: { id: number; stockQty: number | null }[] = [];
  if (sizesRaw !== undefined && sizesRaw !== null) {
    if (!Array.isArray(sizesRaw) || sizesRaw.length > 100) return bad("Invalid units.");
    const seen = new Set<number>();
    for (const r of sizesRaw as { id?: unknown; stockQty?: unknown }[]) {
      const id = r?.id;
      const v = r?.stockQty;
      if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || seen.has(id)) return bad("Invalid units.");
      if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_QTY)) {
        return bad("Unit stock must be a whole number, 0 or more (or blank if you don't track it).");
      }
      seen.add(id);
      sizeUpdates.push({ id, stockQty: v as number | null });
    }
  }

  if (qty === undefined && sizeUpdates.length === 0) return bad("Nothing to update.");

  const product = await prisma.ecomProduct.findUnique({
    where: { id: productId },
    select: { id: true, name: true, productType: true, stockQty: true, sizes: { select: { id: true } } },
  });
  if (!product) return NextResponse.json({ success: false, message: "This product no longer exists." }, { status: 404 });
  if (product.productType !== "physical") return bad("Stock is only tracked for physical products.");

  const ownIds = new Set((product.sizes as { id: number }[]).map((z) => z.id));
  if (sizeUpdates.some((z) => !ownIds.has(z.id))) {
    return bad("One of this product's units has changed. Please reload the page and try again.");
  }

  try {
    await prisma.$transaction([
      ...(qty !== undefined ? [prisma.ecomProduct.update({ where: { id: productId }, data: { stockQty: qty } })] : []),
      ...sizeUpdates.map((z) => prisma.ecomProductSize.update({ where: { id: z.id }, data: { stockQty: z.stockQty } })),
    ]);

    const fresh = await prisma.ecomProduct.findUnique({
      where: { id: productId },
      select: { stockQty: true, sizes: { orderBy: { sortOrder: "asc" }, select: { id: true, stockQty: true } } },
    });

    const parts: string[] = [];
    if (qty !== undefined) parts.push(`product stock ${product.stockQty ?? "not set"} → ${qty}`);
    if (sizeUpdates.length) parts.push(`${sizeUpdates.length} unit${sizeUpdates.length === 1 ? "" : "s"} updated`);
    await logActivity(req, session.userId, "ecom_product_stock_update", `Updated Stock: ${product.name} (ID: ${productId}) — ${parts.join(", ")}`);

    return NextResponse.json({
      success: true,
      stockQty: fresh?.stockQty ?? null,
      sizes: ((fresh?.sizes ?? []) as { id: number; stockQty: number | null }[]).map((z) => ({ id: z.id, stockQty: z.stockQty })),
    });
  } catch (e) {
    console.error("stock-out2 update failed", e);
    return NextResponse.json({ success: false, message: "Could not update the stock. Please try again." }, { status: 500 });
  }
}
