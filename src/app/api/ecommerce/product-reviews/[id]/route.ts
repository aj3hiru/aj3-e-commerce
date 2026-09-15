import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const reviewId = Number(id);
  const body = await req.json().catch(() => ({}));
  const valid = ["pending", "approved", "rejected"];
  const status = valid.includes(body.status) ? body.status : "pending";

  await prisma.ecomProductReview.update({ where: { id: reviewId }, data: { status } });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const reviewId = Number(id);
  await prisma.ecomProductReview.delete({ where: { id: reviewId } });
  return NextResponse.json({ success: true });
}
