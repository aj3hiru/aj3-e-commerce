import Link from "next/link";

export interface StripCategoryData {
  slug: string;
  name: string;
  image: string | null;
}

const STRIP_COLORS = ["#e8f5e9", "#fff3e0", "#e3f2fd", "#fce4ec", "#f3e5f5", "#e0f2f1", "#fffde7"];

/** Verified against the CATEGORY STRIP markup in shop/index.php — rotates through
 *  7 background colors per item. */
export function HomeCategoryStrip({ categories }: { categories: StripCategoryData[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
      {categories.map((cat, i) => (
        <Link key={cat.slug} href={`/shop/category?slug=${cat.slug}`} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl overflow-hidden"
            style={{ background: STRIP_COLORS[i % STRIP_COLORS.length] }}
          >
            {cat.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/${cat.image}`} alt="" className="w-full h-full object-cover" />
            ) : (
              "🛒"
            )}
          </div>
          <span className="text-xs text-center line-clamp-2">{cat.name}</span>
        </Link>
      ))}
    </div>
  );
}
