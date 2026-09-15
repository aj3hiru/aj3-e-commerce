import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { recalcOrderTotals, isOrderLocked } from "@/lib/order-recalc";

/** Verified against order-view.php's update_qty / remove_item / add_item POST
 *  actions. Every mutation here re-runs recalcOrderTotals() afterward, exactly
 *  matching the PHP. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_orders")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = Number(id);
  const order = await prisma.ecomOrder.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });

  if (isOrderLocked(order.orderStatus)) {
    return NextResponse.json({ success: false, message: "This order is completed (Delivered) and can no longer be edited." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === "update_qty") {
    const itemId = Number(body.itemId);
    const qty = Math.max(1, Number(body.qty) || 1);
    await prisma.ecomOrderItem.updateMany({ where: { id: itemId, orderId }, data: { qty } });
    await recalcOrderTotals(prisma, orderId);
    return NextResponse.json({ success: true, message: "Quantity updated." });
  }

  if (body.action === "remove_item") {
    const itemId = Number(body.itemId);
    await prisma.ecomOrderItem.deleteMany({ where: { id: itemId, orderId } });
    await recalcOrderTotals(prisma, orderId);
    return NextResponse.json({ success: true, message: "Item removed from order." });
  }

  if (body.action === "add_item") {
    const productId = Number(body.productId);
    const addQty = Math.max(1, Number(body.addQty) || 1);

    const product = await prisma.ecomProduct.findUnique({ where: { id: productId } });
    if (!product) return NextResponse.json({ success: false, message: "Product not found." }, { status: 404 });

    const salePrice = product.salePrice ? Number(product.salePrice) : 0;
    const price = Number(product.price);
    const effectivePrice = salePrice > 0 && salePrice < price ? salePrice : price;

    // If this product is already a line on the order, bump its qty instead of duplicating.
    const existing = await prisma.ecomOrderItem.findFirst({ where: { orderId, productId } });
    if (existing) {
      await prisma.ecomOrderItem.update({ where: { id: existing.id }, data: { qty: { increment: addQty } } });
    } else {
      await prisma.ecomOrderItem.create({
        data: {
          orderId,
          productId,
          productName: product.name,
          hsnCode: product.hsnCode,
          qty: addQty,
          price: effectivePrice,
          gstRate: product.gstRate,
          gstAmount: 0,
        },
      });
    }

    await recalcOrderTotals(prisma, orderId);
    return NextResponse.json({ success: true, message: "Product added to order." });
  }

  return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
}
