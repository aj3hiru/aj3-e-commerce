import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

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
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `${slugPrefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const uploadDir = path.join(process.cwd(), "public", "uploads", subfolder);
  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), buffer);

  return `uploads/${subfolder}/${filename}`;
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
}
