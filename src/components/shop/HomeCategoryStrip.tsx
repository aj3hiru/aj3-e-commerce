import Link from "next/link";

export interface StripCategoryData {
  slug: string;
  name: string;
  image: string | null;
}

// Verified exact hex values from .c1-.c7 in shop-header.php — NOT a generic
// pastel rotation, these are specific colors with specific text-color pairings
// (c1 and c5 use white text on dark backgrounds, the rest use dark text).
const STRIP_COLORS: { bg: string; text: string }[] = [
  { bg: "#2f6fed", text: "#fff" }, // c1
  { bg: "#dff2e3", text: "#1f2328" }, // c2
  { bg: "#fdf1d8", text: "#1f2328" }, // c3
  { bg: "#fbe4ea", text: "#1f2328" }, // c4
  { bg: "#222", text: "#fff" }, // c5
  { bg: "#e5f6e8", text: "#1f2328" }, // c6
  { bg: "#eaf1ff", text: "#1f2328" }, // c7
];

/**
 * Verified against .icon-strip CSS in shop-header.php (lines 336-372) —
 * corrected color values (7 specific named colors, not a generic rotation)
 * after a first pass had approximated them.
 */
export function HomeCategoryStrip({ categories }: { categories: StripCategoryData[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="flex justify-center gap-[22px] py-[22px] overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      {categories.map((cat, i) => {
        const c = STRIP_COLORS[i % STRIP_COLORS.length];
        return (
          <Link key={cat.slug} href={`/category?slug=${cat.slug}`} className="flex flex-col items-center gap-2 shrink-0 w-[76px]">
            <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center text-[22px] overflow-hidden" style={{ background: c.bg, color: c.text }}>
              {cat.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/${cat.image}`} alt="" className="w-full h-full object-cover rounded-[14px]" />
              ) : (
                "🛒"
              )}
            </div>
            <span className="text-xs font-semibold text-[#333] text-center">{cat.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
