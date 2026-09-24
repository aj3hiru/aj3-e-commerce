import { stat } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { detectFileType } from "@/lib/media-types";

export type AssetCategory =
  | "media" | "product" | "category" | "brand" | "banner" | "payment" | "logo" | "author";

export interface FileAsset {
  id: string; // "media:12" | "product:45" | ...
  name: string; // display filename
  relPath: string; // relative to /public, e.g. "uploads/ecommerce/products/foo.jpg"
  fileType: string; // "image" | "pdf" | "video" | "audio" | "document" | "archive" | "other"
  sizeBytes: number | null; // null = file missing on disk
  category: AssetCategory;
  categoryLabel: string;
  usedBy: string | null; // name of the product/category/... it belongs to
  manageUrl: string | null; // admin page where this image is actually edited
  editable: boolean; // only Media-library rows can be renamed/deleted here
  createdAt: string | null; // ISO, when known
}

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  media: "Blog Media", product: "Product Image", category: "Category Icon", brand: "Brand Logo",
  banner: "Homepage Banner", payment: "Payment Icon", logo: "Site Logo", author: "Author Photo",
};

async function realSize(relPath: string): Promise<number | null> {
  try {
    const s = await stat(path.join(process.cwd(), "public", relPath));
    return s.size;
  } catch {
    return null; // file referenced in the DB but missing on disk — surfaced, not hidden
  }
}
const filename = (p: string) => p.split("/").pop() || p;

/**
 * Every image-bearing field in the schema, aggregated into one list. Only
 * the Media table rows are "files" in the traditional sense (uploaded here,
 * renamable, deletable here); everything else is a real file on disk that
 * some other admin page owns — shown for visibility/search, with an "Open"
 * link back to where it's actually managed, not a Delete button that would
 * silently orphan a product/category/banner's image reference.
 */
export async function getSiteFiles(): Promise<FileAsset[]> {
  const [media, products, productImages, categories, brands, slides, sections, sectionItems, payments, business, authors] = await Promise.all([
    prisma.media.findMany({ orderBy: { uploadedAt: "desc" } }),
    prisma.ecomProduct.findMany({ where: { image: { not: null } }, select: { id: true, name: true, image: true, updatedAt: true } }),
    prisma.ecomProductImage.findMany({ include: { product: { select: { name: true } } } }),
    prisma.ecomCategory.findMany({ where: { image: { not: null } }, select: { id: true, name: true, image: true } }),
    prisma.ecomBrand.findMany({ where: { logo: { not: null } }, select: { id: true, name: true, logo: true } }),
    prisma.ecomHomeSlide.findMany({ select: { id: true, image: true } }),
    prisma.ecomHomeSection.findMany({ where: { bannerImage: { not: null } }, select: { id: true, title: true, bannerImage: true } }),
    prisma.ecomHomeSectionItem.findMany({ where: { customImage: { not: null } }, select: { id: true, customLabel: true, customImage: true } }),
    prisma.ecomPaymentSettings.findMany({ where: { image: { not: null } }, select: { methodKey: true, name: true, image: true } }),
    prisma.ecomBusinessSettings.findFirst({ select: { logo: true, updatedAt: true } }),
    prisma.author.findMany({ where: { profileImage: { not: null } }, select: { id: true, name: true, profileImage: true } }),
  ]);

  const entries: { relPath: string; category: AssetCategory; usedBy: string; manageUrl: string; createdAt: string | null; idPart: string }[] = [];

  for (const p of products as { id: number; name: string; image: string | null; updatedAt: Date }[])
    entries.push({ relPath: p.image!, category: "product", usedBy: p.name, manageUrl: `/admin/ecommerce/products?q=${encodeURIComponent(p.name)}`, createdAt: p.updatedAt.toISOString(), idPart: `product:${p.id}` });
  for (const pi of productImages as { id: number; image: string; product: { name: string } }[])
    entries.push({ relPath: pi.image, category: "product", usedBy: pi.product.name, manageUrl: `/admin/ecommerce/products?q=${encodeURIComponent(pi.product.name)}`, createdAt: null, idPart: `productimg:${pi.id}` });
  for (const c of categories as { id: number; name: string; image: string | null }[])
    entries.push({ relPath: c.image!, category: "category", usedBy: c.name, manageUrl: "/admin/ecommerce/categories", createdAt: null, idPart: `category:${c.id}` });
  for (const b of brands as { id: number; name: string; logo: string | null }[])
    entries.push({ relPath: b.logo!, category: "brand", usedBy: b.name, manageUrl: "/admin/ecommerce/brands", createdAt: null, idPart: `brand:${b.id}` });
  for (const s of slides as { id: number; image: string }[])
    entries.push({ relPath: s.image, category: "banner", usedBy: "Homepage hero slide", manageUrl: "/admin/ecommerce/homepage-settings", createdAt: null, idPart: `slide:${s.id}` });
  for (const sec of sections as { id: number; title: string | null; bannerImage: string | null }[])
    entries.push({ relPath: sec.bannerImage!, category: "banner", usedBy: sec.title || "Festive banner section", manageUrl: "/admin/ecommerce/homepage-settings", createdAt: null, idPart: `section:${sec.id}` });
  for (const it of sectionItems as { id: number; customLabel: string | null; customImage: string | null }[])
    entries.push({ relPath: it.customImage!, category: "banner", usedBy: it.customLabel || "Homepage section item", manageUrl: "/admin/ecommerce/homepage-settings", createdAt: null, idPart: `secitem:${it.id}` });
  for (const pm of payments as { methodKey: string; name: string; image: string | null }[])
    entries.push({ relPath: pm.image!, category: "payment", usedBy: pm.name, manageUrl: "/admin/ecommerce/payment-settings", createdAt: null, idPart: `payment:${pm.methodKey}` });
  if (business?.logo)
    entries.push({ relPath: business.logo, category: "logo", usedBy: "Site logo", manageUrl: "/admin/ecommerce/business-settings", createdAt: business.updatedAt?.toISOString() ?? null, idPart: "logo:site" });
  for (const a of authors as { id: number; name: string; profileImage: string | null }[])
    entries.push({ relPath: a.profileImage!, category: "author", usedBy: a.name, manageUrl: "/admin/pages", createdAt: null, idPart: `author:${a.id}` });

  const assetResults = await Promise.all(entries.map(async (e) => {
    const ext = (e.relPath.split(".").pop() || "").toLowerCase();
    const asset: FileAsset = {
      id: e.idPart, name: filename(e.relPath), relPath: e.relPath, fileType: detectFileType(ext),
      sizeBytes: await realSize(e.relPath), category: e.category, categoryLabel: CATEGORY_LABEL[e.category],
      usedBy: e.usedBy, manageUrl: e.manageUrl, editable: false, createdAt: e.createdAt,
    };
    return asset;
  }));

  const mediaAssets: FileAsset[] = await Promise.all((media as {
    id: number; filePath: string; fileType: string; title: string | null; uploadedAt: Date;
  }[]).map(async (m) => ({
    id: `media:${m.id}`, name: m.title || filename(m.filePath), relPath: m.filePath, fileType: m.fileType,
    sizeBytes: await realSize(m.filePath), category: "media", categoryLabel: CATEGORY_LABEL.media,
    usedBy: null, manageUrl: null, editable: true, createdAt: m.uploadedAt.toISOString(),
  })));

  return [...mediaAssets, ...assetResults].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
