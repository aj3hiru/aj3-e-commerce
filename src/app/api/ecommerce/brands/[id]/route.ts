import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { saveUploadedImage, deleteUploadedImage } from "@/lib/upload";
import { withApiErrors } from "@/lib/api-errors";

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const brandId = Number(id);

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    if (body.status) {
      await prisma.ecomBrand.update({ where: { id: brandId }, data: { status: body.status === "inactive" ? "inactive" : "active" } });
      return NextResponse.json({ success: true });
    }
  }

  const form = await req.formData();
  const name = (form.get("name") as string | null)?.trim() ?? "";
  const slugRaw = (form.get("slug") as string | null)?.trim() ?? "";
  const isPopular = form.get("is_popular") === "1";
  const logoFile = form.get("logo") as File | null;

  if (!name) return NextResponse.json({ success: false, message: "Brand name is required." }, { status: 400 });

  const baseSlug = generateSlug(slugRaw || name);
  const slug = await makeUniqueSlug(baseSlug, async (s) => !!(await prisma.ecomBrand.findFirst({ where: { slug: s, id: { not: brandId } } })));

  let logoPath: string | undefined;
  if (logoFile && logoFile.size > 0) {
    const existing = await prisma.ecomBrand.findUnique({ where: { id: brandId }, select: { logo: true } });
    await deleteUploadedImage(existing?.logo);
    logoPath = await saveUploadedImage(logoFile, "ecommerce/brands", slug);
  }

  await prisma.ecomBrand.update({
    where: { id: brandId },
    data: { name, slug, isPopular, ...(logoPath ? { logo: logoPath } : {}) },
  });
  await logActivity(req, session.userId, "ecom_brand_update", `Updated Brand: ${name} (ID: ${brandId})`);

  return NextResponse.json({ success: true, redirect: "/admin/ecommerce/brands?success=updated" });
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const brandId = Number(id);

  const brand = await prisma.ecomBrand.findUnique({ where: { id: brandId }, select: { name: true, logo: true } });
  await prisma.ecomBrand.delete({ where: { id: brandId } });
  await deleteUploadedImage(brand?.logo);
  await logActivity(req, session.userId, "ecom_brand_delete", `Deleted Brand: ${brand?.name ?? "Unknown"} (ID: ${brandId})`);

  return NextResponse.json({ success: true });
}

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
