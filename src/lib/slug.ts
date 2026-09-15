import slugify from "slugify";

/** Mirrors generateSlug() from includes/functions.php (not directly visible in the
 *  source dump, but its contract is inferable from every call site: lowercase,
 *  hyphenated, URL-safe). */
export function generateSlug(input: string): string {
  return slugify(input, { lower: true, strict: true, trim: true });
}

/**
 * Mirrors uniqueCatSlug()-style helpers used across admin/ecommerce/*.php
 * (categories.php, brands via add-brand-ajax.php, etc.): appends -1, -2, ... until
 * the slug is free, excluding the row currently being edited.
 */
export async function makeUniqueSlug(
  baseSlug: string,
  checkExists: (slug: string) => Promise<boolean>
): Promise<string> {
  let slug = baseSlug;
  let i = 1;
  while (await checkExists(slug)) {
    slug = `${baseSlug}-${i++}`;
  }
  return slug;
}
