import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const label = (body.label ?? "").trim();
  const rate = Number(body.rate) || 0;

  if (!label) return NextResponse.json({ success: false, message: "Label is required." }, { status: 400 });

  if (body.editId) {
    await prisma.ecomGstRate.update({ where: { id: Number(body.editId) }, data: { label, rate } });
    return NextResponse.json({ success: true, redirect: "/admin/ecommerce/tax-settings?success=updated" });
  }

  await prisma.ecomGstRate.create({ data: { label, rate } });
  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/tax-settings?success=created" });
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  await prisma.ecomGstRate.delete({ where: { id } });
  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/tax-settings?success=deleted" });
}

/** Verified against the ?set_default=ID GET action — unsets every other row first. */
export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const id = Number(body.setDefaultId);

  await prisma.ecomGstRate.updateMany({ data: { isDefault: false }, where: {} });
  await prisma.ecomGstRate.update({ where: { id }, data: { isDefault: true } });

  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/tax-settings?success=default" });
}
