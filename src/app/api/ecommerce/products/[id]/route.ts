import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

/** Verified against the `?set_status=active|inactive&id=N` quick-publish toggle
 *  at the top of products.php. */
async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) {
    return NextResponse.json({ success: false, message: "Invalid product id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const newStatus = body.status === "inactive" ? "inactive" : "active";

  await prisma.ecomProduct.update({ where: { id: productId }, data: { status: newStatus } });
  return NextResponse.json({ success: true });
}

/** Verified against the POST action=delete handler in products.php: deletes the
 *  DB row, best-effort removes the image file from disk, and logs the action. */
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) {
    return NextResponse.json({ success: false, message: "Invalid product id" }, { status: 400 });
  }

  try {
    const product = await prisma.ecomProduct.findUnique({ where: { id: productId }, select: { name: true, image: true } });
    await prisma.ecomProduct.delete({ where: { id: productId } });

    if (product?.image) {
      try {
        await unlink(path.join(process.cwd(), "public", product.image));
      } catch {
        // best-effort file cleanup, matches the PHP's @unlink() error suppression
      }
    }

    await logActivity(
      req,
      session.userId,
      "ecom_product_delete",
      `Deleted Product: ${product?.name ?? "Unknown"} (ID: ${productId})`
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Delete failed. Please try again." }, { status: 500 });
  }
}

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
