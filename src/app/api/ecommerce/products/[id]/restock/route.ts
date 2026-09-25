import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { withApiErrors } from "@/lib/api-errors";

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const qty = Math.max(0, Number(body.qty) || 0);

  await prisma.ecomProduct.update({ where: { id: Number(id) }, data: { stockQty: qty } });
  return NextResponse.json({ success: true });
}

export const POST = withApiErrors(handlePOST);
