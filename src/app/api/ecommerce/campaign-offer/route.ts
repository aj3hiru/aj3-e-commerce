import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "add") {
    const productId = Number(body.productId);
    const campaignPrice = Number(body.campaignPrice);
    if (!productId || campaignPrice <= 0) {
      return NextResponse.json({ success: false, message: "Please select a product and enter a valid campaign price." }, { status: 400 });
    }
    await prisma.ecomProduct.update({ where: { id: productId }, data: { isCampaign: true, campaignPrice } });
    return NextResponse.json({ success: true, redirect: "/admin/ecommerce/campaign-offer?success=added" });
  }

  if (action === "remove") {
    const productId = Number(body.productId);
    await prisma.ecomProduct.update({ where: { id: productId }, data: { isCampaign: false, campaignPrice: null, showOnHome: false } });
    return NextResponse.json({ success: true, redirect: "/admin/ecommerce/campaign-offer?success=removed" });
  }

  if (action === "toggle_home") {
    const productId = Number(body.productId);
    const product = await prisma.ecomProduct.findUnique({ where: { id: productId }, select: { showOnHome: true } });
    await prisma.ecomProduct.update({ where: { id: productId }, data: { showOnHome: !product?.showOnHome } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
}
