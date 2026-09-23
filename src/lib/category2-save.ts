import { prisma } from "@/lib/db";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { deleteUploadedImage, saveUploadedImage } from "@/lib/upload";

/**
 * Create / update logic for /admin/ecommerce/categories2 — same fields as
 * the current Categories page (name, slug, image, meta keywords/description,
 * serial), plus the checks it didn't have: duplicate names, image type/size,
 * remove-image.
 */
export class CategorySaveError extends Error {
  constructor(message: string, public field?: string, public status = 400) {
    super(message);
  }
}

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"]);
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

async function parse(form: FormData, editId: number | null) {
  const name = text(form, "name");
  if (!name) throw new CategorySaveError("Category name is required.", "name");
  if (name.length > 150) throw new CategorySaveError("Category name is too long (150 characters max).", "name");
  const dup = await prisma.ecomCategory.findFirst({
    where: { name, ...(editId ? { NOT: { id: editId } } : {}) },
    select: { id: true },
  });
  if (dup) throw new CategorySaveError(`A category called "${name}" already exists.`, "name");

  const base = generateSlug(text(form, "slug") || name) || `category-${Date.now()}`;
  const slug = await makeUniqueSlug(base, async (s) =>
    !!(await prisma.ecomCategory.findFirst({ where: { slug: s, ...(editId ? { NOT: { id: editId } } : {}) }, select: { id: true } }))
  );

  const image = form.get("image");
  const file = image instanceof File && image.size > 0 ? image : null;
  if (file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!file.type.startsWith("image/") || !IMAGE_EXT.has(ext)) throw new CategorySaveError("The image must be a photo (JPG, PNG, WebP, SVG…).", "image");
    if (file.size > 2 * 1024 * 1024) throw new CategorySaveError("The image is larger than 2 MB.", "image");
  }

  const serialRaw = text(form, "serial");
  const serial = serialRaw ? Math.max(0, Math.trunc(Number(serialRaw)) || 0) : 0;

  return {
    name,
    slug,
    file,
    removeImage: form.get("remove_image") === "1",
    metaKeywords: text(form, "meta_keywords") || null,
    metaDescription: text(form, "meta_description") || null,
    serial,
    status: form.get("status") === "inactive" ? "inactive" : "active",
  };
}

export async function createCategory2(form: FormData) {
  const p = await parse(form, null);
  const image = p.file ? await saveUploadedImage(p.file, "ecommerce/categories", p.slug) : null;
  try {
    return await prisma.ecomCategory.create({
      data: {
        name: p.name, slug: p.slug, image,
        metaKeywords: p.metaKeywords, metaDescription: p.metaDescription,
        serial: p.serial, status: p.status,
      },
      select: { id: true, name: true },
    });
  } catch (e) {
    await deleteUploadedImage(image);
    throw e;
  }
}

export async function updateCategory2(id: number, form: FormData) {
  const existing = await prisma.ecomCategory.findUnique({ where: { id }, select: { image: true } });
  if (!existing) throw new CategorySaveError("This category no longer exists.", undefined, 404);
  const oldImage = existing.image;
  const p = await parse(form, id);
  const newImage = p.file ? await saveUploadedImage(p.file, "ecommerce/categories", p.slug) : null;
  const image = newImage ?? (p.removeImage ? null : oldImage);
  try {
    const updated = await prisma.ecomCategory.update({
      where: { id },
      data: {
        name: p.name, slug: p.slug, image,
        metaKeywords: p.metaKeywords, metaDescription: p.metaDescription,
        serial: p.serial, status: p.status,
      },
      select: { id: true, name: true },
    });
    if (oldImage && oldImage !== image) await deleteUploadedImage(oldImage);
    return updated;
  } catch (e) {
    await deleteUploadedImage(newImage);
    throw e;
  }
}
