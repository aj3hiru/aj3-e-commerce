import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Creates a real `EcomProduct` row for an item a cashier is selling that isn't
 * in the catalog yet, then returns it in the same shape `PosProduct` expects
 * so the billing screen can add it to the cart immediately.
 *
 * A genuinely ad-hoc, product-less line item was considered and rejected:
 * `EcomOrderItem.productId` is a required foreign key (schema.prisma), so an
 * order item with no backing product can't be inserted without a second schema
 * change on top of the `unit` one already made. Creating a real product also
 * means it is available to re-sell next time without retyping it, and every
 * report/stock/GST code path the checkout API already runs stays exactly the
 * same — no parallel "orphan item" logic to keep in sync with it.
 *
 * This product has no stock tracking (`stockQty: null`) since it was typed in
 * on the spot rather than stocked and counted ahead of time; an admin can find
 * it later under Products and add stock tracking/a category if they want.
 */
const quickProductSchema = z.object({
  name: z.string().trim().min(1, "Product name is required."),
  price: z.coerce.number().min(0, "Price must be zero or more."),
  gst_rate: z.coerce.number().min(0).max(100).default(0),
  unit: z.string().trim().max(40).default(""),
});

async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_billing")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = quickProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid product details." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const baseSlug = generateSlug(input.name) || `product-${Date.now()}`;
  const slug = await makeUniqueSlug(baseSlug, async (s) => {
    const found = await prisma.ecomProduct.findUnique({ where: { slug: s }, select: { id: true } });
    return !!found;
  });

  try {
    const product = await prisma.ecomProduct.create({
      data: {
        name: input.name,
        slug,
        productType: "physical",
        price: input.price,
        gstRate: input.gst_rate,
        unit: input.unit || null,
        stockQty: null,
        status: "active",
      },
    });

    await logActivity(
      req,
      session.userId,
      "ecom_product_create",
      `Quick-added product from Billing: ${product.name} (ID: ${product.id})`
    );

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        price: Number(product.price),
        salePrice: null,
        gstRate: Number(product.gstRate),
        stockQty: product.stockQty,
        productType: product.productType,
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId,
        unit: product.unit,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create product.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
