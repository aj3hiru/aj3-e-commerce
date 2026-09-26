import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appSession } from "@/lib/app-api";
import { hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Quick product edit from the staff app: only the fields sent are changed
 * (description, sizes, specs and other website-only fields are left alone).
 * Same rules as the website form: unique barcode, sale price below price,
 * whole-number stock, GST 0–100, category / brand must exist.
 */
async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  if (!hasPermission(s.permissions, "ecommerce", "manage_products")) return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  const id = Number((await params).id);
  const cur = Number.isInteger(id) ? await prisma.ecomProduct.findUnique({ where: { id }, select: { id: true, name: true, price: true, salePrice: true, productType: true } }) : null;
  if (!cur) return NextResponse.json({ success: false, message: "This product no longer exists." }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const bad = (message: string, field: string) => NextResponse.json({ success: false, message, field }, { status: 400 });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : v === null ? "" : undefined);
  const data: Record<string, unknown> = {};

  const name = str(b.name, 255);
  if (name !== undefined) { if (!name) return bad("Enter the product name.", "name"); data.name = name; }
  for (const [k, col, max] of [["sku", "sku", 100], ["hsn", "hsnCode", 20], ["unit", "unit", 40]] as const) {
    const v = str(b[k], max); if (v !== undefined) data[col] = v || null;
  }
  const barcode = str(b.barcode, 100);
  if (barcode !== undefined) {
    if (barcode) {
      const dup = await prisma.ecomProduct.findFirst({ where: { barcode, NOT: { id } }, select: { id: true, name: true } });
      if (dup) return bad(`This barcode is already used by “${dup.name}” (product #${dup.id}).`, "barcode");
    }
    data.barcode = barcode || null;
  }
  const price = b.price === undefined ? Number(cur.price) : Number(b.price);
  if (b.price !== undefined) { if (!Number.isFinite(price) || price < 0) return bad("Enter a valid price.", "price"); data.price = price; }
  if (b.salePrice !== undefined) {
    const sp = b.salePrice === null || b.salePrice === "" ? null : Number(b.salePrice);
    if (sp !== null && (!Number.isFinite(sp) || sp < 0)) return bad("Enter a valid sale price.", "salePrice");
    if (sp !== null && sp > 0 && sp >= price) return bad("Sale price should be lower than the price (leave it empty for no sale).", "salePrice");
    data.salePrice = sp;
  } else if (b.price !== undefined && cur.salePrice !== null && Number(cur.salePrice) >= price) {
    return bad("The sale price is now higher than the price — change or clear the sale price too.", "salePrice");
  }
  if (b.gstRate !== undefined) { const g = Number(b.gstRate); if (!Number.isFinite(g) || g < 0 || g > 100) return bad("Choose a valid GST rate.", "gstRate"); data.gstRate = g; }
  if (b.stock !== undefined && cur.productType === "physical") {
    const q = Number(b.stock); if (!Number.isInteger(q) || q < 0) return bad("Stock must be a whole number, 0 or more.", "stock"); data.stockQty = q;
  }
  // "Received 20 more" from a device: added on the server, so two devices counting stock never overwrite each other.
  if (b.stockAdd !== undefined && cur.productType === "physical") {
    const q = Number(b.stockAdd); if (!Number.isInteger(q) || q < 0 || q > 1_000_000) return bad("Enter how many were received.", "stock"); data.stockQty = { increment: q };
  }
  if (b.status !== undefined) data.status = b.status === "inactive" ? "inactive" : "active";
  for (const [k, col, model] of [["categoryId", "categoryId", "ecomCategory"], ["brandId", "brandId", "ecomBrand"]] as const) {
    if (b[k] === undefined) continue;
    const v = b[k] === null || b[k] === "" ? null : Number(b[k]);
    if (v !== null) {
      const hit = model === "ecomCategory" ? await prisma.ecomCategory.findUnique({ where: { id: v }, select: { id: true } }) : await prisma.ecomBrand.findUnique({ where: { id: v }, select: { id: true } });
      if (!hit) return bad(`That ${k === "categoryId" ? "category" : "brand"} no longer exists.`, k);
    }
    data[col] = v;
    if (k === "categoryId") data.subcategoryId = null;
  }
  if (!Object.keys(data).length) return NextResponse.json({ success: true, id });
  await prisma.ecomProduct.update({ where: { id }, data });
  await logActivity(req, s.userId, "ecom_product_update", `Updated Product (app): ${String(data.name ?? cur.name)} (ID: ${id}) — ${Object.keys(data).join(", ")}`);
  return NextResponse.json({ success: true, id });
}

export const PATCH = withApiErrors(handlePATCH);

/** Everything the website's product form shows, so the app can edit all of it. */
async function handleGET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  if (!hasPermission(s.permissions, "ecommerce", "manage_products")) return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  const id = Number((await params).id);
  const p = Number.isInteger(id)
    ? await prisma.ecomProduct.findUnique({
        where: { id },
        include: {
          images: { orderBy: { sortOrder: "asc" }, select: { id: true, image: true } },
          sizes: { orderBy: { sortOrder: "asc" }, select: { label: true, mrp: true, price: true, stockQty: true, isDefault: true } },
          specs: { orderBy: { sortOrder: "asc" }, select: { name: true, value: true } },
        },
      })
    : null;
  if (!p) return NextResponse.json({ success: false, message: "This product no longer exists." }, { status: 404 });
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return NextResponse.json({
    success: true,
    product: {
      id: p.id, name: p.name, slug: p.slug, sku: p.sku, hsn: p.hsnCode, barcode: p.barcode, description: p.description,
      categoryId: p.categoryId, brandId: p.brandId, unit: p.unit, type: p.productType, price: n(p.price), salePrice: n(p.salePrice),
      gstRate: n(p.gstRate), stock: p.stockQty, status: p.status, badgeTag: p.badgeTag, itemType: p.itemType,
      showOnHome: p.showOnHome, isCampaign: p.isCampaign, campaignPrice: n(p.campaignPrice), image: p.image,
      downloadLink: p.downloadLink, licenseKey: p.licenseKey, affiliateUrl: p.affiliateUrl,
      gallery: p.images.map((g) => ({ id: g.id, image: g.image })),
      sizes: p.sizes.map((z) => ({ label: z.label, mrp: n(z.mrp), price: n(z.price), stock: z.stockQty, isDefault: z.isDefault })),
      specs: p.specs.map((x) => ({ name: x.name, value: x.value })),
    },
  });
}

export const GET = withApiErrors(handleGET);
