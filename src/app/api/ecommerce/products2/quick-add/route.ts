import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { saveUploadedImage } from "@/lib/upload";

/**
 * "+ Add new…" from inside the product form on /admin/ecommerce/add-product2:
 * brand (with optional logo — the PHP's add-brand-ajax.php), category,
 * sub-category (under a chosen category) and item type. Returns the new
 * option so the form selects it without leaving the page. An existing name is
 * reused instead of creating a duplicate. Multipart form data.
 */
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"]);

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ success: false, message: "Could not read the form." }, { status: 400 });

  const kind = String(form.get("kind") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const fail = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status });

  if (!["brand", "category", "subcategory", "item_type"].includes(kind)) return fail("Unknown type.");
  if (!name) return fail("Please enter a name.");
  if (name.length > 100) return fail("Name is too long (100 characters max).");

  if (kind === "brand") {
    const existing = await prisma.ecomBrand.findFirst({ where: { name }, select: { id: true, name: true } });
    if (existing) return NextResponse.json({ success: true, id: existing.id, name: existing.name, existed: true });
    const slug = await makeUniqueSlug(generateSlug(name) || `brand-${Date.now()}`, async (s) => !!(await prisma.ecomBrand.findFirst({ where: { slug: s } })));
    const logoFile = form.get("logo");
    let logo: string | null = null;
    if (logoFile instanceof File && logoFile.size > 0) {
      const ext = (logoFile.name.split(".").pop() || "").toLowerCase();
      if (!logoFile.type.startsWith("image/") || !IMAGE_EXT.has(ext)) return fail("The logo must be an image (JPG, PNG, WebP, SVG…).");
      if (logoFile.size > 2 * 1024 * 1024) return fail("The logo is larger than 2 MB.");
      logo = await saveUploadedImage(logoFile, "ecommerce/brands", slug);
    }
    const created = await prisma.ecomBrand.create({ data: { name, slug, logo, status: "active" }, select: { id: true, name: true } });
    await logActivity(req, session.userId, "ecom_brand_create", `Created Brand: ${name} (ID: ${created.id})`);
    return NextResponse.json({ success: true, id: created.id, name: created.name });
  }

  if (kind === "category") {
    const existing = await prisma.ecomCategory.findFirst({ where: { name }, select: { id: true, name: true } });
    if (existing) return NextResponse.json({ success: true, id: existing.id, name: existing.name, existed: true });
    const slug = await makeUniqueSlug(generateSlug(name) || `category-${Date.now()}`, async (s) => !!(await prisma.ecomCategory.findFirst({ where: { slug: s } })));
    const created = await prisma.ecomCategory.create({ data: { name, slug, status: "active", serial: 0 }, select: { id: true, name: true } });
    await logActivity(req, session.userId, "ecom_category_create", `Created Category: ${name} (ID: ${created.id})`);
    return NextResponse.json({ success: true, id: created.id, name: created.name });
  }

  if (kind === "subcategory") {
    const categoryId = Number(form.get("category_id"));
    if (!Number.isInteger(categoryId) || categoryId <= 0) return fail("Choose a category first.");
    const cat = await prisma.ecomCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!cat) return fail("That category no longer exists.");
    const existing = await prisma.ecomSubcategory.findFirst({ where: { name, categoryId }, select: { id: true, name: true, categoryId: true } });
    if (existing) return NextResponse.json({ success: true, id: existing.id, name: existing.name, categoryId: existing.categoryId, existed: true });
    const slug = await makeUniqueSlug(generateSlug(name) || `sub-${Date.now()}`, async (s) => !!(await prisma.ecomSubcategory.findFirst({ where: { slug: s } })));
    const created = await prisma.ecomSubcategory.create({ data: { name, slug, categoryId, status: "active" }, select: { id: true, name: true, categoryId: true } });
    await logActivity(req, session.userId, "ecom_subcategory_create", `Created Sub Category: ${name} (ID: ${created.id})`);
    return NextResponse.json({ success: true, id: created.id, name: created.name, categoryId: created.categoryId });
  }

  // item_type
  const existing = await prisma.ecomProductTag.findFirst({ where: { tagGroup: "item_type", label: name }, select: { slug: true, label: true } });
  if (existing) return NextResponse.json({ success: true, slug: existing.slug, name: existing.label, existed: true });
  const slug = await makeUniqueSlug(generateSlug(name) || `type-${Date.now()}`, async (s) =>
    !!(await prisma.ecomProductTag.findFirst({ where: { slug: s, tagGroup: "item_type" } }))
  );
  const last = await prisma.ecomProductTag.findFirst({ where: { tagGroup: "item_type" }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const created = await prisma.ecomProductTag.create({
    data: { label: name, slug, tagGroup: "item_type", sortOrder: (last?.sortOrder ?? 0) + 1, status: "active" },
    select: { slug: true, label: true },
  });
  await logActivity(req, session.userId, "ecom_tag_create", `Created Item Type: ${name}`);
  return NextResponse.json({ success: true, slug: created.slug, name: created.label });
}
