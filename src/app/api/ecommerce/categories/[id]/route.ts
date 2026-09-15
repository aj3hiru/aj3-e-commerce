import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { saveUploadedImage, deleteUploadedImage } from "@/lib/upload";

/** Verified against the action==='update' branch of categories.php. Replaces the
 *  image only if a new file was uploaded (old image deleted), otherwise keeps it. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) {
    return NextResponse.json({ success: false, message: "Invalid category id" }, { status: 400 });
  }

  // Quick status toggle (matches the ?set_status=active|inactive&id=N GET link)
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    if (body.status) {
      const newStatus = body.status === "inactive" ? "inactive" : "active";
      await prisma.ecomCategory.update({ where: { id: categoryId }, data: { status: newStatus } });
      return NextResponse.json({ success: true });
    }
  }

  const form = await req.formData();
  const name = (form.get("name") as string | null)?.trim() ?? "";
  const slugRaw = (form.get("slug") as string | null)?.trim() ?? "";
  const metaKeywords = (form.get("meta_keywords") as string | null)?.trim() ?? "";
  const metaDescription = (form.get("meta_description") as string | null)?.trim() ?? "";
  const serial = Number(form.get("serial") ?? 0) || 0;
  const imageFile = form.get("image") as File | null;

  if (!name) {
    return NextResponse.json({ success: false, message: "Category name is required." }, { status: 400 });
  }

  const baseSlug = generateSlug(slugRaw || name);
  const slug = await makeUniqueSlug(baseSlug, async (s) => {
    const existing = await prisma.ecomCategory.findFirst({ where: { slug: s, id: { not: categoryId } } });
    return !!existing;
  });

  let imagePath: string | undefined;
  if (imageFile && imageFile.size > 0) {
    const existing = await prisma.ecomCategory.findUnique({ where: { id: categoryId }, select: { image: true } });
    await deleteUploadedImage(existing?.image);
    imagePath = await saveUploadedImage(imageFile, "ecommerce/categories", slug);
  }

  try {
    await prisma.ecomCategory.update({
      where: { id: categoryId },
      data: {
        name,
        slug,
        ...(imagePath ? { image: imagePath } : {}),
        metaKeywords: metaKeywords || null,
        metaDescription: metaDescription || null,
        serial,
      },
    });

    await logActivity(req, session.userId, "ecom_category_update", `Updated Category: ${name} (ID: ${categoryId})`);

    return NextResponse.json({ success: true, redirect: "/admin/ecommerce/categories?success=updated" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unexpected error";
    return NextResponse.json({ success: false, message: `Save failed: ${message}` }, { status: 500 });
  }
}

/** Verified against the POST action==='delete' handler in categories.php. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId)) {
    return NextResponse.json({ success: false, message: "Invalid category id" }, { status: 400 });
  }

  try {
    const category = await prisma.ecomCategory.findUnique({ where: { id: categoryId }, select: { name: true, image: true } });
    await prisma.ecomCategory.delete({ where: { id: categoryId } });
    await deleteUploadedImage(category?.image);

    await logActivity(req, session.userId, "ecom_category_delete", `Deleted Category: ${category?.name ?? "Unknown"} (ID: ${categoryId})`);

    return NextResponse.json({ success: true });
  } catch {
    // Matches the PHP's generic catch — most commonly a FK constraint because
    // subcategories still reference this category.
    return NextResponse.json(
      { success: false, message: "Delete failed: this category may still have subcategories linked to it." },
      { status: 409 }
    );
  }
}
