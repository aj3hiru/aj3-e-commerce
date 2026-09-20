import { prisma } from "@/lib/db";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { deleteUploadedImage, saveUploadedImage } from "@/lib/upload";

/**
 * Create / update logic for /admin/ecommerce/brands2 — same fields and upload
 * folder as the current Brands page (name, slug, logo, popular, status), plus
 * checks it didn't have: duplicate names, images only (≤ 2 MB), remove logo.
 */
export class BrandSaveError extends Error {
  constructor(message: string, public field?: string, public status = 400) {
    super(message);
  }
}

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"]);
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

async function parse(form: FormData, editId: number | null) {
  const name = text(form, "name");
  if (!name) throw new BrandSaveError("Brand name is required.", "name");
  if (name.length > 100) throw new BrandSaveError("Brand name is too long (100 characters max).", "name");
  const dup = await prisma.ecomBrand.findFirst({
    where: { name, ...(editId ? { NOT: { id: editId } } : {}) },
    select: { id: true },
  });
  if (dup) throw new BrandSaveError(`A brand called “${name}” already exists.`, "name");

  const base = generateSlug(text(form, "slug") || name) || `brand-${Date.now()}`;
  const slug = await makeUniqueSlug(base, async (s) =>
    !!(await prisma.ecomBrand.findFirst({ where: { slug: s, ...(editId ? { NOT: { id: editId } } : {}) }, select: { id: true } }))
  );

  const logo = form.get("logo");
  const file = logo instanceof File && logo.size > 0 ? logo : null;
  if (file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!file.type.startsWith("image/") || !IMAGE_EXT.has(ext)) throw new BrandSaveError("The logo must be an image (JPG, PNG, WebP, SVG…).", "logo");
    if (file.size > 2 * 1024 * 1024) throw new BrandSaveError("The logo is larger than 2 MB.", "logo");
  }
  return {
    name,
    slug,
    file,
    removeLogo: form.get("remove_logo") === "1",
    isPopular: form.get("is_popular") === "1",
    status: form.get("status") === "inactive" ? "inactive" : "active",
  };
}

export async function createBrand2(form: FormData) {
  const p = await parse(form, null);
  const logo = p.file ? await saveUploadedImage(p.file, "ecommerce/brands", p.slug) : null;
  try {
    return await prisma.ecomBrand.create({
      data: { name: p.name, slug: p.slug, logo, isPopular: p.isPopular, status: p.status },
      select: { id: true, name: true },
    });
  } catch (e) {
    await deleteUploadedImage(logo);
    throw e;
  }
}

export async function updateBrand2(id: number, form: FormData) {
  const existing = await prisma.ecomBrand.findUnique({ where: { id }, select: { logo: true } });
  if (!existing) throw new BrandSaveError("This brand no longer exists.", undefined, 404);
  const oldLogo = existing.logo;
  const p = await parse(form, id);
  const newLogo = p.file ? await saveUploadedImage(p.file, "ecommerce/brands", p.slug) : null;
  const logo = newLogo ?? (p.removeLogo ? null : oldLogo);
  try {
    const updated = await prisma.ecomBrand.update({
      where: { id },
      data: { name: p.name, slug: p.slug, logo, isPopular: p.isPopular, status: p.status },
      select: { id: true, name: true },
    });
    if (oldLogo && oldLogo !== logo) await deleteUploadedImage(oldLogo);
    return updated;
  } catch (e) {
    await deleteUploadedImage(newLogo);
    throw e;
  }
}
