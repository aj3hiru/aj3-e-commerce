"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Menu, MapPin, Clock, Search, Heart, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import type { ShopBusinessSettings, ShopCustomer, ShopHeaderSettings } from "@/types/shop";
import type { MenuDesign } from "@/types/storefront";
import { formatMoneyInt } from "@/lib/format";
import { PushBell } from "./push/PushContext";
import { DesktopMenu, type ResolvedItem } from "./menu/StoreMenus";

interface ShopHeaderProps {
  business: ShopBusinessSettings;
  header: ShopHeaderSettings;
  customer: ShopCustomer | null;
  /** Business Settings → Header Menu, already filtered for this visitor. */
  menu: ResolvedItem[];
  design: MenuDesign;
  onOpenMobileMenu: () => void;
}

/**
 * Ported 1:1 from shop/includes/shop-header.php — the `<header class="topbar">`
 * + `<nav class="navbar">` desktop pair, and the separate `.mobile-topbar` /
 * `.mobile-search` block below it.
 *
 * Two things here are easy to get wrong and are therefore spelled out:
 *
 * 1. The desktop/mobile switch is at **901px**, not Tailwind's `md` (768px).
 *    The PHP does `@media (max-width:900px){ .topbar{display:none} … }` paired
 *    with `@media (min-width:901px){ .mobile-topbar{display:none} }`, so the
 *    custom `shop:` breakpoint is used throughout this file.
 *
 * 2. `mb_strimwidth()` counts the ellipsis inside the width it is given, so
 *    `mb_strimwidth($addr, 0, 18, '...')` yields at most 18 characters TOTAL
 *    (15 of text + '...'), not 18 + '...'. See truncate() below.
 */
export function ShopHeader(props: ShopHeaderProps) {
  return (
    <Suspense fallback={null}>
      <ShopHeaderInner {...props} />
    </Suspense>
  );
}

/**
 * PHP's mb_strimwidth($s, 0, $width, $trim): if the string is longer than
 * $width, it is cut so that the result *including* the trim marker is $width
 * characters. The location line passes an empty marker, the address line
 * passes '...'.
 */
function strimwidth(value: string, width: number, marker = ""): string {
  const s = value.trim();
  if (s.length <= width) return s;
  return s.slice(0, Math.max(0, width - marker.length)) + marker;
}

function ShopHeaderInner({ business, header, customer, menu, design, onOpenMobileMenu }: ShopHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { count, total } = useCart();
  const currentSlug = searchParams?.get("slug") ?? "";
  // A menu link is "current" when its path matches, and for category links its ?slug too.
  const isActive = (href: string) => {
    const [path, query = ""] = href.split("#")[0].split("?");
    if (path !== pathname) return false;
    const slug = new URLSearchParams(query).get("slug");
    return slug ? slug === currentSlug : path !== "/category" && !href.includes("#");
  };
  const currentQ = searchParams?.get("q") ?? "";

  // `$shop_show_location && $shop_biz_location` — the toggle alone isn't
  // enough, an empty location hides the block too.
  const showLocation = header.showLocation && !!business.location;
  const showDelivery = header.showDeliveryInfo && !!header.deliveryTimeText;

  const accountHref = customer ? "/account" : "/login";
  const accountLabel = customer ? customer.name.split(" ")[0] : "Login";

  return (
    <>
      {/* ============ DESKTOP HEADER (.topbar) ============ */}
      <header className="hidden shop:flex items-center gap-5 px-8 py-3 border-b border-storefront-border bg-white h-[76px]">
        <Link href="/" className="flex items-center gap-1.5 shrink-0" aria-label={`${business.businessName} home`}>
          {business.logo ? (
            <Image
              src={`/${business.logo}`}
              alt={`${business.businessName} logo`}
              width={150}
              height={44}
              className="h-11 w-auto max-w-[150px] object-contain rounded-[4px] block"
            />
          ) : (
            <span className="text-[26px] font-extrabold text-[var(--hp-accent)] tracking-[0.2px] leading-none">
              {business.businessName}
            </span>
          )}
        </Link>

        {/* .location — two lines: truncated location + chevron, then the address */}
        {showLocation && (
          <div className="flex items-center gap-1.5 px-3 h-11 bg-[#f8f9fe] rounded-[8px] text-sm whitespace-nowrap shrink-0 text-[#353543]">
            <MapPin className="w-[18px] h-[18px] text-[#5d7eea] shrink-0" fill="#8aa4f4" strokeWidth={1.6} />
            <div>
              <span className="font-bold flex items-center gap-1">
                {strimwidth(business.location ?? "", 12)}
                {/* the little chevron that sits inline after the place name */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
              {business.address && (
                <span className="block text-xs text-storefront-muted">
                  {strimwidth(business.address, 18, "...")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* .delivery-info */}
        {showDelivery && (
          <div className="text-[13px] whitespace-nowrap shrink-0 text-[#333]">
            <span className="text-[var(--hp-accent)] font-bold">{header.deliveryLabel}</span>
            <div className="flex items-center gap-[5px] font-bold mt-[3px]">
              <Clock className="w-3.5 h-3.5 text-storefront-orange" strokeWidth={2} />
              {header.deliveryTimeText}
            </div>
          </div>
        )}

        <form action="/" method="GET" className="flex-1 min-w-[200px] flex h-11">
          <input
            type="text"
            name="q"
            placeholder={header.searchPlaceholder}
            defaultValue={currentQ}
            className="flex-1 w-full border border-[#cfcedc] border-r-0 rounded-l-[8px] px-4 text-sm outline-none text-[#353543] placeholder:text-[#8b8ba3] focus:border-[var(--hp-accent)]"
          />
          <button
            type="submit"
            className="bg-[var(--hp-accent)] hover:brightness-95 text-white px-[26px] rounded-r-[8px] font-bold text-[13px] tracking-[0.4px]"
          >
            SEARCH
          </button>
        </form>

        <div className="flex items-center gap-[26px] whitespace-nowrap shrink-0">
          <PushBell className="text-[#353543]" iconClassName="w-[22px] h-[22px]" />
          <Link href={accountHref} className="flex items-center gap-[7px] text-sm font-semibold text-[#333]">
            <User className="w-[22px] h-[22px] text-[#353543] shrink-0" strokeWidth={1.8} />
            <span>{accountLabel}</span>
          </Link>
          <Link href="/wishlist" className="flex items-center gap-[7px] text-sm font-semibold text-[#333]" aria-label="Wishlist">
            <Heart className="w-[22px] h-[22px] text-[#ef4444] shrink-0" fill="#ef4444" strokeWidth={0} />
          </Link>
          <Link href="/cart" className="flex items-center gap-1.5 relative text-sm font-semibold text-[#333]">
            <div className="relative">
              <ShoppingCart className="w-[22px] h-[22px] text-[var(--hp-accent)] shrink-0" fill="color-mix(in srgb, var(--hp-accent) 22%, white)" strokeWidth={2} />
              {count > 0 && (<span className="absolute -top-[9px] left-[13px] bg-[var(--hp-accent)] text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center ring-2 ring-white">
                {count}
              </span>)}
            </div>
            <span>{formatMoneyInt(total)}</span>
          </Link>
        </div>
      </header>

      {/* ============ MAIN MENU (Business Settings → Header Menu) ============ */}
      <DesktopMenu items={menu} design={design} isActive={isActive} />

      {/* ============ MOBILE HEADER (.mobile-topbar) ============ */}
      <div className="flex shop:hidden items-center justify-between px-4 pt-3.5 pb-2.5 bg-white">
        <button onClick={onOpenMobileMenu} aria-label="Open menu" className="shrink-0">
          <Menu className="w-6 h-6 text-[#353543]" strokeWidth={2} />
        </button>
        <Link href="/" aria-label={`${business.businessName} home`}>
          {business.logo ? (
            <Image
              src={`/${business.logo}`}
              alt={`${business.businessName} logo`}
              width={110}
              height={34}
              className="h-[34px] w-auto max-w-[110px] object-contain"
            />
          ) : (
            <span className="text-[22px] font-extrabold tracking-[-0.2px] text-[var(--hp-accent)]">{business.businessName}</span>
          )}
        </Link>
        <div className="flex items-center gap-[18px]">
          <PushBell className="text-[#353543]" iconClassName="w-6 h-6" />
          <Link href="/wishlist" aria-label="Wishlist">
            <Heart className="w-6 h-6 text-[#ef4444]" fill="#ef4444" strokeWidth={0} />
          </Link>
          <Link href="/cart" className="relative" aria-label="Cart">
            <ShoppingCart className="w-6 h-6 text-[var(--hp-accent)]" fill="color-mix(in srgb, var(--hp-accent) 22%, white)" strokeWidth={2} />
            {count > 0 && (<span className="absolute -top-2 left-[14px] bg-[var(--hp-accent)] text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center ring-2 ring-white">
              {count}
            </span>)}
          </Link>
          <Link href={accountHref} aria-label={accountLabel}>
            <User className="w-6 h-6 text-[#353543]" strokeWidth={1.8} />
          </Link>
        </div>
      </div>

      {/* ============ MOBILE SEARCH (.mobile-search) ============ */}
      <form action="/" method="GET" className="shop:hidden px-4 pt-1 pb-3 bg-white border-b border-[#eaeaf2]">
        <div className="flex items-center gap-2.5 bg-white border border-[#cfcedc] rounded-[8px] px-3.5 py-3 focus-within:border-[var(--hp-accent)]">
          <Search className="w-[20px] h-[20px] text-[#5d7eea] shrink-0" strokeWidth={2} />
          <input
            type="text"
            name="q"
            placeholder={header.searchPlaceholder}
            defaultValue={currentQ}
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-[#353543] placeholder:text-[#8b8ba3]"
          />
        </div>
      </form>
    </>
  );
}
