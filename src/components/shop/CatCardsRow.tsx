import Link from "next/link";

export interface CatCardData {
  href: string;
  image: string | null;
  label: string;
}

/** Verified against the .cat-cards / .ccard markup shared by category_row and
 *  manual_products home sections in shop/index.php. */
export function CatCardsRow({ title, cards }: { title: string | null; cards: CatCardData[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="mb-5">
      {title && <div className="font-bold text-base mb-2.5">{title}</div>}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
        {cards.map((c, i) => (
          <Link key={i} href={c.href} className="flex flex-col items-center gap-1.5 shrink-0 w-20">
            <div className="w-20 h-20 rounded-lg bg-storefront-bg flex items-center justify-center overflow-hidden">
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/${c.image}`} alt={c.label} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">🛒</span>
              )}
            </div>
            <p className="text-xs text-center line-clamp-2">{c.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
