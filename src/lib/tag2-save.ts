/**
 * Rules for saving a badge tag / item type from
 * /admin/ecommerce/product-tags2. Pure (no database), so the form and the API
 * apply exactly the same checks.
 */
export interface CleanTag {
  label: string;
  slug: string;
  tagGroup: "badge" | "item_type";
  color: string | null;
  sortOrder: number;
  status: "active" | "inactive";
}

export type TagParse = { ok: true; value: CleanTag } | { ok: false; message: string; field?: string };

/** "Best Seller" → "best-seller". The slug is what products store. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function parseTagInput(raw: unknown): TagParse {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Invalid request." };
  const b = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const label = str(b.label);
  if (!label) return { ok: false, message: "Enter a name for this tag.", field: "label" };
  if (label.length > 50) return { ok: false, message: "The name can be at most 50 characters.", field: "label" };

  const tagGroup = b.tagGroup === "item_type" ? "item_type" : "badge";

  const slug = slugify(str(b.slug) || label);
  if (!slug) return { ok: false, message: "That name can't be turned into a code. Use letters or numbers.", field: "label" };

  // "none" and "normal" are the built-in "no tag" values and can't be reused.
  if ((tagGroup === "badge" && slug === "none") || (tagGroup === "item_type" && slug === "normal")) {
    return { ok: false, message: `“${slug}” is reserved — it means “no tag”. Pick another name.`, field: "label" };
  }

  const color = str(b.color);
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { ok: false, message: "Pick a colour, or leave it empty.", field: "color" };

  const sortOrderRaw = b.sortOrder;
  const sortOrder = typeof sortOrderRaw === "number" && Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 0;
  if (sortOrder < 0 || sortOrder > 9999) return { ok: false, message: "The order must be between 0 and 9999.", field: "sortOrder" };

  return {
    ok: true,
    value: {
      label,
      slug,
      tagGroup,
      // Only a badge is drawn in colour; an item type never shows one.
      color: tagGroup === "badge" ? color || null : null,
      sortOrder,
      status: b.status === "inactive" ? "inactive" : "active",
    },
  };
}
