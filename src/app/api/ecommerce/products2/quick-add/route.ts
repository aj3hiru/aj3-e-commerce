import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";

/**
 * "+ Add New Brand…" / "+ Add New Item Type…" from inside the product form
 * (the PHP's add-brand-ajax.php / item-type modal), returning the new option
 * so the form can select it without leaving the page. An existing name is
 * reused instead of creating a duplicate.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "item_type" ? "item_type" : body.kind === "brand" ? "brand" : null;
  const name = String(body.name ?? "").trim();
  if (!kind) return NextResponse.json({ success: false, message: "Unknown type." }, { status: 400 });
  if (!name) return NextResponse.json({ success: false, message: "Please enter a name." }, { status: 400 });
  if (name.length > 100) return NextResponse.json({ success: false, message: "Name is too long." }, { status: 400 });

  if (kind === "brand") {
    const existing = await prisma.ecomBrand.findFirst({ where: { name }, select: { id: true, name: true } });
    if (existing) return NextResponse.json({ success: true, id: existing.id, name: existing.name, existed: true });
    const slug = await makeUniqueSlug(generateSlug(name) || `brand-${Date.now()}`, async (s) => !!(await prisma.ecomBrand.findFirst({ where: { slug: s } })));
    const created = await prisma.ecomBrand.create({ data: { name, slug, status: "active" }, select: { id: true, name: true } });
    await logActivity(req, session.userId, "ecom_brand_create", `Created Brand: ${name} (ID: ${created.id})`);
    return NextResponse.json({ success: true, id: created.id, name: created.name });
  }

  const existing = await prisma.ecomProductTag.findFirst({ where: { tagGroup: "item_type", label: name }, select: { slug: true, label: true } });
  if (existing) return NextResponse.json({ success: true, slug: existing.slug, label: existing.label, existed: true });
  const slug = await makeUniqueSlug(generateSlug(name) || `type-${Date.now()}`, async (s) =>
    !!(await prisma.ecomProductTag.findFirst({ where: { slug: s, tagGroup: "item_type" } }))
  );
  const last = await prisma.ecomProductTag.findFirst({ where: { tagGroup: "item_type" }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const created = await prisma.ecomProductTag.create({
    data: { label: name, slug, tagGroup: "item_type", sortOrder: (last?.sortOrder ?? 0) + 1, status: "active" },
    select: { slug: true, label: true },
  });
  await logActivity(req, session.userId, "ecom_tag_create", `Created Item Type: ${name}`);
  return NextResponse.json({ success: true, slug: created.slug, label: created.label });
}
