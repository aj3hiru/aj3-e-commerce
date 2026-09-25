import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { withApiErrors } from "@/lib/api-errors";

/** Live duplicate-barcode check while typing/scanning on add-product2. */
async function handleGET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const barcode = (req.nextUrl.searchParams.get("barcode") ?? "").trim();
  const exclude = Number(req.nextUrl.searchParams.get("exclude") ?? 0);
  if (!barcode) return NextResponse.json({ success: true, taken: null });
  const hit = await prisma.ecomProduct.findFirst({
    where: { barcode, ...(Number.isInteger(exclude) && exclude > 0 ? { NOT: { id: exclude } } : {}) },
    select: { id: true, name: true },
  });
  return NextResponse.json({ success: true, taken: hit });
}

export const GET = withApiErrors(handleGET);
