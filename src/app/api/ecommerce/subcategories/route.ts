import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").trim();
  const categoryId = Number(body.categoryId ?? 0);
  const status = body.status === "inactive" ? "inactive" : "active";

  if (!name) return NextResponse.json({ success: false, message: "Subcategory name is required." }, { status: 400 });
  if (categoryId <= 0) return NextResponse.json({ success: false, message: "Please select a parent category." }, { status: 400 });

  const baseSlug = generateSlug(body.slug || name);
  const slug = await makeUniqueSlug(baseSlug, async (s) => !!(await prisma.ecomSubcategory.findFirst({ where: { slug: s } })));

  const created = await prisma.ecomSubcategory.create({ data: { name, categoryId, slug, status } });
  await logActivity(req, session.userId, "ecom_subcategory_create", `Created Sub Category: ${name} (ID: ${created.id})`);

  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/subcategories?success=created" });
}
