import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveUploadedImage } from "@/lib/upload";
import { generateSlug } from "@/lib/slug";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const numberOrNull = (value: string) => value === "" ? null : Number(value);

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const form = await req.formData();
  const name = text(form, "name");
  const productType = text(form, "product_type") || "physical";
  const price = Number(text(form, "price"));
  if (!name || !Number.isFinite(price) || price < 0) {
    return NextResponse.json({ success: false, message: "Product name and a valid price are required." }, { status: 400 });
  }

  const baseSlug = generateSlug(text(form, "slug") || name) || `product-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.ecomProduct.findUnique({ where: { slug }, select: { id: true } })) slug = `${baseSlug}-${suffix++}`;

  const imageFile = form.get("image");
  const image = imageFile instanceof File && imageFile.size > 0
    ? await saveUploadedImage(imageFile, "ecommerce/products", "product")
    : null;

  try {
    const product = await prisma.ecomProduct.create({
      data: {
        name,
        slug,
        categoryId: numberOrNull(text(form, "category_id")),
        subcategoryId: numberOrNull(text(form, "subcategory_id")),
        brandId: numberOrNull(text(form, "brand_id")),
        sku: text(form, "sku") || null,
        hsnCode: text(form, "hsn_code") || null,
        barcode: text(form, "barcode") || null,
        productType,
        price,
        salePrice: numberOrNull(text(form, "sale_price")),
        gstRate: Number(text(form, "gst_rate") || "0"),
        stockQty: productType === "physical" ? numberOrNull(text(form, "stock_qty")) : null,
        image,
        description: text(form, "description") || null,
        badgeTag: text(form, "badge_tag") || "none",
        itemType: text(form, "item_type") || "normal",
        status: form.get("status") === "inactive" ? "inactive" : "active",
        downloadLink: text(form, "download_link") || null,
        licenseKey: text(form, "license_key") || null,
        affiliateUrl: text(form, "affiliate_url") || null,
        isCampaign: form.get("is_campaign") === "on",
        campaignPrice: numberOrNull(text(form, "campaign_price")),
        showOnHome: form.get("show_on_home") === "on",
      },
    });
    await logActivity(req, session.userId, "ecom_product_create", `Created Product: ${product.name} (ID: ${product.id})`);
    return NextResponse.json({ success: true, redirect: "/admin/ecommerce/products?success=created" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create product.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
