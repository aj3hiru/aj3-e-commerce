import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { toWebp } from "@/lib/image-webp";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * Mirrors the image-upload pattern repeated across admin/ecommerce/*.php
 * (categories.php, add-product-form.php, etc.):
 *   $filename = $slug . '-' . uniqid() . '.' . $ext;
 *   move_uploaded_file(...)
 *
 * Saves to /public/uploads/... so the returned path can be used directly as an
 * <img src> the same way the original stored a DB-relative path like
 * "uploads/ecommerce/categories/foo-64f2a1.jpg".
 */
export async function saveUploadedImage(
  file: File,
  subfolder: string, // e.g. "ecommerce/categories"
  slugPrefix: string
): Promise<string> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  // Only real image types — these files are served straight from /public on
  // our own origin, so an uploaded .html/.svg/.js would be stored XSS.
  if (!IMAGE_EXTENSIONS.includes(ext) || !file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error("Only JPG, PNG, GIF or WEBP images can be uploaded.");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Image is too large (max 10MB).");
  }
  // Stored as a compressed WebP (see image-webp.ts); a broken image is refused.
  let data: Buffer;
  try {
    data = await toWebp(Buffer.from(await file.arrayBuffer()), ext);
  } catch {
    throw new Error("This image couldn't be read. Please try another photo.");
  }
  const filename = `${slugPrefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.webp`;

  const uploadDir = path.join(process.cwd(), "public", "uploads", subfolder);
  await mkdir(uploadDir, { recursive: true });

  await writeFile(path.join(uploadDir, filename), data);

  const rel = `uploads/${subfolder}/${filename}`;
  // Also list it in the File Manager (best-effort — the upload itself already worked).
  try {
    await prisma.media.create({ data: { filePath: rel, fileType: "image", altText: "", title: file.name.replace(/\.[^.]+$/, "").slice(0, 190) } });
  } catch (e) {
    console.error("media register failed", e);
  }
  return rel;
}

/** Best-effort delete, mirrors the PHP's `@unlink()` error suppression when
 *  replacing/removing an old image. */
export async function deleteUploadedImage(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  try {
    await unlink(path.join(process.cwd(), "public", relativePath));
  } catch {
    // best-effort, matches PHP's @unlink()
  }
  try {
    await prisma.media.deleteMany({ where: { filePath: relativePath } });
  } catch {
    // still linked from a post, or the table is missing — leave the row
  }
}
