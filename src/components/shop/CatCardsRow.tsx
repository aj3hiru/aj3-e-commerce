import Link from "next/link";

export interface CatCardData {
  href: string;
  image: string | null;
  label: string;
}

/**
 * Verified against .cat-row-title / .cat-cards CSS in shop-header.php
 * (lines 374-411) — REBUILT after discovering the first pass rendered this
 * as a horizontally-scrolling row of small circular thumbnails, when the
 * real design is an 8-column CSS GRID of square cards with rounded corners
 * (no scrolling at this breakpoint), light-blue placeholder background
 * (#eaf2fb), and bold 17px labels below each image — a much bigger, more
 * prominent card than the first pass's compact scroller implied.
 */
export function CatCardsRow({ title, cards }: { title: string | null; cards: CatCardData[] }) {
  if (cards.length === 0) return null;

  return (
    <div>
      {title && <div className="text-xl font-extrabold pt-5 pb-1">{title}</div>}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-x-4 gap-y-5 py-3 pb-[30px]">
        {cards.map((c, i) => (
          <Link key={i} href={c.href} className="text-center">
            <div className="w-full aspect-square bg-[#eaf2fb] rounded-xl flex items-center justify-center gap-1 mb-2.5 overflow-hidden">
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/${c.image}`} alt={c.label} className="w-full h-full object-cover rounded-xl" />
              ) : (
                <span className="text-[30px]">🛒</span>
              )}
            </div>
            <p className="text-[17px] font-bold text-[#222] leading-tight">{c.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
