import { prisma } from "@/lib/db";
import { generateSlug } from "@/lib/slug";
import { deleteUploadedImage, saveUploadedImage } from "@/lib/upload";

/**
 * Save logic for /admin/ecommerce/add-product2 (create + edit), following
 * admin/ecommerce/add-product-form.php:
 *   - slug auto-generated from the name and made unique (excluding the row
 *     being edited)
 *   - duplicate-barcode check BEFORE saving, naming the product that has it
 *   - a blank barcode on create becomes "EM" + 8-digit id; on edit a blank
 *     barcode keeps the old one
 *   - a new main image replaces (and deletes) the old file
 *   - gallery: remove ticked images, append new uploads after the last one
 * Plus a few safety checks the PHP didn't have: images only (≤ 5 MB), sale
 * price below price, sub-category must belong to the category.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const PRODUCT_TYPES = new Set(["physical", "digital", "license", "affiliate"]);

export class SaveError extends Error {
  constructor(message: string, public field?: string, public status = 400) {
    super(message);
  }
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const intOrNull = (v: string) => {
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function checkImage(file: File, what: string) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!file.type.startsWith("image/") || !IMAGE_EXT.has(ext)) {
    throw new SaveError(`${what} must be an image (JPG, PNG, WebP, GIF or AVIF).`, "image");
  }
  if (file.size > MAX_IMAGE_BYTES) throw new SaveError(`${what} is larger than 5 MB.`, "image");
}

const fileOrNull = (v: FormDataEntryValue | null) => (v instanceof File && v.size > 0 ? v : null);

/** Reads and validates the form. `editId` is null when creating. */
async function parse(form: FormData, editId: number | null) {
  const name = text(form, "name");
  if (!name) throw new SaveError("Product name is required.", "name");
  if (name.length > 255) throw new SaveError("Product name is too long (255 characters max).", "name");

  const price = Number(text(form, "price"));
  if (text(form, "price") === "" || !Number.isFinite(price) || price < 0) throw new SaveError("Enter a valid price.", "price");

  const saleRaw = text(form, "sale_price");
  const salePrice = saleRaw === "" ? null : Number(saleRaw);
  if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0)) throw new SaveError("Enter a valid sale price.", "sale_price");
  if (salePrice !== null && salePrice > 0 && salePrice >= price) {
    throw new SaveError("Sale price should be lower than the price (leave it empty for no sale).", "sale_price");
  }

  const gstRate = Number(text(form, "gst_rate") || "0");
  if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) throw new SaveError("Choose a valid GST rate.", "gst_rate");

  const productType = PRODUCT_TYPES.has(text(form, "product_type")) ? text(form, "product_type") : "physical";

  let stockQty: number | null = null;
  if (productType === "physical") {
    const s = text(form, "stock_qty");
    stockQty = s === "" ? 0 : Number(s);
    if (!Number.isInteger(stockQty) || stockQty < 0) throw new SaveError("Stock must be a whole number, 0 or more.", "stock_qty");
  }

  // Category / sub-category / brand must exist; a sub-category from another category is dropped.
  const categoryId = intOrNull(text(form, "category_id"));
  let subcategoryId = intOrNull(text(form, "subcategory_id"));
  const brandId = intOrNull(text(form, "brand_id"));
  const [cat, sub, brand] = await Promise.all([
    categoryId ? prisma.ecomCategory.findUnique({ where: { id: categoryId }, select: { id: true } }) : null,
    subcategoryId ? prisma.ecomSubcategory.findUnique({ where: { id: subcategoryId }, select: { categoryId: true } }) : null,
    brandId ? prisma.ecomBrand.findUnique({ where: { id: brandId }, select: { id: true } }) : null,
  ]);
  if (categoryId && !cat) throw new SaveError("That category no longer exists. Please choose another.", "category_id");
  if (brandId && !brand) throw new SaveError("That brand no longer exists. Please choose another.", "brand_id");
  if (!categoryId || !sub || sub.categoryId !== categoryId) subcategoryId = null;

  const barcode = text(form, "barcode");
  if (barcode.length > 100) throw new SaveError("Barcode is too long.", "barcode");
  if (barcode) {
    const dup = await prisma.ecomProduct.findFirst({
      where: { barcode, ...(editId ? { NOT: { id: editId } } : {}) },
      select: { id: true, name: true },
    });
    if (dup) {
      throw new SaveError(
        `This barcode is already used by “${dup.name}” (product #${dup.id}). Scan or enter a different barcode, or open that product to edit it instead.`,
        "barcode"
      );
    }
  }

  const image = fileOrNull(form.get("image"));
  if (image) checkImage(image, "The product image");
  const gallery = form.getAll("gallery_images").map(fileOrNull).filter((f): f is File => f !== null);
  gallery.forEach((f) => checkImage(f, `Gallery image “${f.name}”`));
  if (gallery.length > 20) throw new SaveError("You can add up to 20 gallery images at a time.", "gallery");

  const isCampaign = form.get("is_campaign") === "on";
  const campaignRaw = text(form, "campaign_price");
  const campaignPrice = isCampaign && campaignRaw !== "" ? Number(campaignRaw) : null;
  if (campaignPrice !== null && (!Number.isFinite(campaignPrice) || campaignPrice < 0)) {
    throw new SaveError("Enter a valid campaign price.", "campaign_price");
  }

  // Unique slug, ignoring the product being edited.
  const baseSlug = generateSlug(text(form, "slug") || name) || `product-${Date.now()}`;
  let slug = baseSlug;
  for (let i = 1; ; i++) {
    const hit = await prisma.ecomProduct.findFirst({
      where: { slug, ...(editId ? { NOT: { id: editId } } : {}) },
      select: { id: true },
    });
    if (!hit) break;
    slug = `${baseSlug}-${i}`;
  }

  return {
    data: {
      name,
      slug,
      categoryId,
      subcategoryId,
      brandId,
      sku: text(form, "sku") || null,
      hsnCode: text(form, "hsn_code") || null,
      unit: text(form, "unit") || null,
      productType,
      price,
      salePrice,
      gstRate,
      stockQty,
      description: text(form, "description") || null,
      badgeTag: text(form, "badge_tag") || "none",
      itemType: text(form, "item_type") || "normal",
      status: form.get("status") === "inactive" ? "inactive" : "active",
      downloadLink: productType === "digital" ? text(form, "download_link") || null : null,
      licenseKey: productType === "license" ? text(form, "license_key") || null : null,
      affiliateUrl: productType === "affiliate" ? text(form, "affiliate_url") || null : null,
      isCampaign,
      campaignPrice,
      showOnHome: form.get("show_on_home") === "on",
    },
    barcode,
    image,
    gallery,
    removeImage: form.get("remove_image") === "1",
    removedGalleryIds: form.getAll("removed_gallery_ids").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0),
  };
}

async function addGallery(productId: number, files: File[]) {
  if (!files.length) return;
  const last = await prisma.ecomProductImage.findFirst({ where: { productId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  let order = (last?.sortOrder ?? -1) + 1;
  for (const f of files) {
    const path = await saveUploadedImage(f, "ecommerce/products", "gallery");
    await prisma.ecomProductImage.create({ data: { productId, image: path, sortOrder: order++ } });
  }
}

/** Prisma's unique-constraint error (e.g. two people saving the same barcode at once). */
function isUniqueError(e: unknown): e is { code: string; meta?: { target?: unknown } } {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function createProduct2(form: FormData): Promise<{ id: number; name: string }> {
  const p = await parse(form, null);
  const image = p.image ? await saveUploadedImage(p.image, "ecommerce/products", p.data.slug) : null;
  try {
    const created = await prisma.ecomProduct.create({
      data: { ...p.data, image, barcode: p.barcode || null },
      select: { id: true, name: true },
    });
    if (!p.barcode) {
      // Same automatic barcode as the PHP: EM + id padded to 8 digits.
      await prisma.ecomProduct.update({ where: { id: created.id }, data: { barcode: `EM${String(created.id).padStart(8, "0")}` } });
    }
    await addGallery(created.id, p.gallery);
    return created;
  } catch (e) {
    await deleteUploadedImage(image);
    if (isUniqueError(e)) throw new SaveError("This barcode or slug is already in use. Please change it and try again.", "barcode");
    throw e;
  }
}

export async function updateProduct2(id: number, form: FormData): Promise<{ id: number; name: string }> {
  const existing = await prisma.ecomProduct.findUnique({ where: { id }, select: { id: true, image: true } });
  if (!existing) throw new SaveError("This product no longer exists.", undefined, 404);

  const oldImage = existing.image;
  const p = await parse(form, id);
  const newImage = p.image ? await saveUploadedImage(p.image, "ecommerce/products", p.data.slug) : null;
  const image = newImage ?? (p.removeImage ? null : oldImage);
  try {
    const updated = await prisma.ecomProduct.update({
      where: { id },
      // A blank barcode keeps the old one (as in the PHP).
      data: { ...p.data, image, ...(p.barcode ? { barcode: p.barcode } : {}) },
      select: { id: true, name: true },
    });
    if (oldImage && oldImage !== image) await deleteUploadedImage(oldImage);

    if (p.removedGalleryIds.length) {
      const gone = await prisma.ecomProductImage.findMany({ where: { id: { in: p.removedGalleryIds }, productId: id }, select: { id: true, image: true } });
      if (gone.length) {
        await prisma.ecomProductImage.deleteMany({ where: { id: { in: gone.map((g: { id: number }) => g.id) }, productId: id } });
        for (const g of gone as { image: string }[]) await deleteUploadedImage(g.image);
      }
    }
    await addGallery(id, p.gallery);
    return updated;
  } catch (e) {
    await deleteUploadedImage(newImage);
    if (isUniqueError(e)) throw new SaveError("This barcode or slug is already in use. Please change it and try again.", "barcode");
    throw e;
  }
}
