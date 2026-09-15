import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { saveUploadedImage } from "@/lib/upload";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const form = await req.formData();
  const name = (form.get("name") as string | null)?.trim() ?? "";
  const slugRaw = (form.get("slug") as string | null)?.trim() ?? "";
  const isPopular = form.get("is_popular") === "1";
  const logoFile = form.get("logo") as File | null;

  if (!name) return NextResponse.json({ success: false, message: "Brand name is required." }, { status: 400 });

  const baseSlug = generateSlug(slugRaw || name);
  const slug = await makeUniqueSlug(baseSlug, async (s) => !!(await prisma.ecomBrand.findFirst({ where: { slug: s } })));

  let logoPath: string | null = null;
  if (logoFile && logoFile.size > 0) {
    logoPath = await saveUploadedImage(logoFile, "ecommerce/brands", slug);
  }

  const created = await prisma.ecomBrand.create({ data: { name, slug, logo: logoPath, isPopular, status: "active" } });
  await logActivity(req, session.userId, "ecom_brand_create", `Created Brand: ${name} (ID: ${created.id})`);

  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/brands?success=created" });
}
