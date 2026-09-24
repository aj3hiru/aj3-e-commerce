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
    return slug ? slug === currentSlug : path !== "/shop/category" && !href.includes("#");
  };
  const currentQ = searchParams?.get("q") ?? "";

  // `$shop_show_location && $shop_biz_location` — the toggle alone isn't
  // enough, an empty location hides the block too.
  const showLocation = header.showLocation && !!business.location;
  const showDelivery = header.showDeliveryInfo && !!header.deliveryTimeText;

  const accountHref = customer ? "/shop/account" : "/shop/login";
  const accountLabel = customer ? customer.name.split(" ")[0] : "Login";

  return (
    <>
      {/* ============ DESKTOP HEADER (.topbar) ============ */}
      <header className="hidden shop:flex items-center gap-5 px-8 py-3 border-b border-storefront-border bg-white h-[76px]">
        <Link href="/shop" className="flex items-center gap-1.5 shrink-0" aria-label={`${business.businessName} home`}>
          {business.logo ? (
            <Image
              src={`/${business.logo}`}
              alt={`${business.businessName} logo`}
              width={150}
              height={44}
              className="h-11 w-auto max-w-[150px] object-contain rounded-[4px] block"
            />
          ) : (
            <span className="text-[26px] font-extrabold text-storefront-green-dark tracking-[0.2px] leading-none">
              {business.businessName}
            </span>
          )}
        </Link>

        {/* .location — two lines: truncated location + chevron, then the address */}
        {showLocation && (
          <div className="flex items-center gap-1.5 px-3 h-11 bg-storefront-green-light rounded-[8px] text-sm whitespace-nowrap shrink-0">
            <MapPin className="w-[18px] h-[18px] text-storefront-green shrink-0" fill="currentColor" strokeWidth={0} />
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
            <span className="text-storefront-green font-bold">{header.deliveryLabel}</span>
            <div className="flex items-center gap-[5px] font-bold mt-[3px]">
              <Clock className="w-3.5 h-3.5 text-storefront-orange" strokeWidth={2} />
              {header.deliveryTimeText}
            </div>
          </div>
        )}

        <form action="/shop" method="GET" className="flex-1 min-w-[200px] flex h-11">
          <input
            type="text"
            name="q"
            placeholder={header.searchPlaceholder}
            defaultValue={currentQ}
            className="flex-1 w-full border border-storefront-border border-r-0 rounded-l-[6px] px-4 text-sm outline-none text-[#333] placeholder:text-[#8a8a8a]"
          />
          <button
            type="submit"
            className="bg-storefront-green hover:bg-storefront-green-dark text-white px-[26px] rounded-r-[6px] font-bold text-[13px] tracking-[0.4px]"
          >
            SEARCH
          </button>
        </form>

        <div className="flex items-center gap-[26px] whitespace-nowrap shrink-0">
          <PushBell className="text-storefront-green" iconClassName="w-[22px] h-[22px]" />
          <Link href={accountHref} className="flex items-center gap-[7px] text-sm font-semibold text-[#333]">
            <User className="w-[22px] h-[22px] text-storefront-green shrink-0" strokeWidth={1.8} />
            <span>{accountLabel}</span>
          </Link>
          <Link href="/shop/wishlist" className="flex items-center gap-[7px] text-sm font-semibold text-[#333]" aria-label="Wishlist">
            <Heart className="w-[22px] h-[22px] text-storefront-green shrink-0" strokeWidth={1.8} />
          </Link>
          <Link href="/shop/cart" className="flex items-center gap-1.5 relative text-sm font-semibold text-[#333]">
            <div className="relative">
              <ShoppingCart className="w-[22px] h-[22px] text-storefront-green shrink-0" strokeWidth={1.8} />
              <span className="absolute -top-[9px] left-[13px] bg-[#fdd835] text-[#333] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {count}
              </span>
            </div>
            <span>{formatMoneyInt(total)}</span>
          </Link>
        </div>
      </header>

      {/* ============ MAIN MENU (Business Settings → Header Menu) ============ */}
      <DesktopMenu items={menu} design={design} isActive={isActive} />

      {/* ============ MOBILE HEADER (.mobile-topbar) ============ */}
      <div className="flex shop:hidden items-center justify-between px-4 py-3.5 border-b border-storefront-border bg-white">
        <button onClick={onOpenMobileMenu} aria-label="Open menu" className="shrink-0">
          <Menu className="w-6 h-6 text-[#333]" strokeWidth={2} />
        </button>
        <Link href="/shop" aria-label={`${business.businessName} home`}>
          {business.logo ? (
            <Image
              src={`/${business.logo}`}
              alt={`${business.businessName} logo`}
              width={110}
              height={34}
              className="h-[34px] w-auto max-w-[110px] object-contain"
            />
          ) : (
            <span className="text-xl font-extrabold text-storefront-green-dark">{business.businessName}</span>
          )}
        </Link>
        <div className="flex items-center gap-[18px]">
          <PushBell className="text-storefront-green" iconClassName="w-6 h-6" />
          <Link href="/shop/wishlist" aria-label="Wishlist">
            <Heart className="w-6 h-6 text-storefront-green" strokeWidth={1.8} />
          </Link>
          <Link href="/shop/cart" className="relative" aria-label="Cart">
            <ShoppingCart className="w-6 h-6 text-storefront-green" strokeWidth={1.8} />
            <span className="absolute -top-2 left-[14px] bg-[#fdd835] text-[#333] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {count}
            </span>
          </Link>
          <Link href={accountHref} aria-label={accountLabel}>
            <User className="w-6 h-6 text-storefront-green" strokeWidth={1.8} />
          </Link>
        </div>
      </div>

      {/* ============ MOBILE SEARCH (.mobile-search) ============ */}
      <form action="/shop" method="GET" className="shop:hidden px-4 pt-3 pb-4 bg-white border-b border-storefront-border">
        <div className="flex items-center gap-2.5 bg-[#eee] rounded-[6px] px-3.5 py-3">
          <Search className="w-[18px] h-[18px] text-[#666] shrink-0" strokeWidth={2} />
          <input
            type="text"
            name="q"
            placeholder={header.searchPlaceholder}
            defaultValue={currentQ}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-[#333] placeholder:text-[#8a8a8a]"
          />
        </div>
      </form>
    </>
  );
}
