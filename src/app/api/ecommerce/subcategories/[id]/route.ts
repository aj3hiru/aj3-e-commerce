import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { withApiErrors } from "@/lib/api-errors";

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const subId = Number(id);
  const body = await req.json().catch(() => ({}));

  if (body.status && Object.keys(body).length === 1) {
    const newStatus = body.status === "inactive" ? "inactive" : "active";
    await prisma.ecomSubcategory.update({ where: { id: subId }, data: { status: newStatus } });
    return NextResponse.json({ success: true });
  }

  const name = (body.name ?? "").trim();
  const categoryId = Number(body.categoryId ?? 0);
  const status = body.status === "inactive" ? "inactive" : "active";
  if (!name) return NextResponse.json({ success: false, message: "Subcategory name is required." }, { status: 400 });
  if (categoryId <= 0) return NextResponse.json({ success: false, message: "Please select a parent category." }, { status: 400 });

  const baseSlug = generateSlug(body.slug || name);
  const slug = await makeUniqueSlug(baseSlug, async (s) => !!(await prisma.ecomSubcategory.findFirst({ where: { slug: s, id: { not: subId } } })));

  await prisma.ecomSubcategory.update({ where: { id: subId }, data: { name, categoryId, slug, status } });
  await logActivity(req, session.userId, "ecom_subcategory_update", `Updated Sub Category: ${name} (ID: ${subId})`);

  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/subcategories?success=updated" });
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const subId = Number(id);

  const sub = await prisma.ecomSubcategory.findUnique({ where: { id: subId }, select: { name: true } });
  await prisma.ecomSubcategory.delete({ where: { id: subId } });
  await logActivity(req, session.userId, "ecom_subcategory_delete", `Deleted Sub Category: ${sub?.name ?? "Unknown"} (ID: ${subId})`);

  return NextResponse.json({ success: true });
}

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
