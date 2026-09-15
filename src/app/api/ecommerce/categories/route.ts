import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { saveUploadedImage } from "@/lib/upload";

/** Verified against the action==='create' branch of categories.php's POST handler. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_categories")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
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
    const existing = await prisma.ecomCategory.findFirst({ where: { slug: s } });
    return !!existing;
  });

  let imagePath: string | null = null;
  if (imageFile && imageFile.size > 0) {
    imagePath = await saveUploadedImage(imageFile, "ecommerce/categories", slug);
  }

  try {
    const created = await prisma.ecomCategory.create({
      data: {
        name,
        slug,
        image: imagePath,
        metaKeywords: metaKeywords || null,
        metaDescription: metaDescription || null,
        serial,
        status: "active",
      },
    });

    await logActivity(req, session.userId, "ecom_category_create", `Created Category: ${name} (ID: ${created.id})`);

    return NextResponse.json({ success: true, redirect: "/admin/ecommerce/categories?success=created" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unexpected error";
    return NextResponse.json({ success: false, message: `Save failed: ${message}` }, { status: 500 });
  }
}
