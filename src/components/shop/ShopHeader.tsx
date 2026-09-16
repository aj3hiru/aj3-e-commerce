"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Menu, MapPin, Clock, Search, Heart, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import type { ShopBusinessSettings, ShopCategoryNavItem, ShopCustomer } from "@/types/shop";
import { cn } from "@/lib/utils";

interface ShopHeaderProps {
  business: ShopBusinessSettings;
  categories: ShopCategoryNavItem[];
  customer: ShopCustomer | null;
  onOpenMobileMenu: () => void;
}

/**
 * Verified 1:1 against shop/includes/shop-header.php lines 1009-1099:
 * a desktop <header class="topbar"> + category <nav class="navbar">, and a
 * separate mobile topbar with its own search bar. Business hours / location
 * / logo all render conditionally exactly as they did in PHP.
 */
export function ShopHeader(props: ShopHeaderProps) {
  return (
    <Suspense fallback={null}>
      <ShopHeaderInner {...props} />
    </Suspense>
  );
}

function ShopHeaderInner({ business, categories, customer, onOpenMobileMenu }: ShopHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { count, total } = useCart();
  const currentSlug = searchParams?.get("slug") ?? "";
  const currentQ = searchParams?.get("q") ?? "";

  return (
    <>
      {/* ============ DESKTOP HEADER ============ */}
      <header className="hidden md:flex items-center gap-5 px-8 py-3 border-b border-storefront-border bg-white h-[76px]">
        <Link href="/shop" className="flex items-center gap-1.5 shrink-0" aria-label={`${business.businessName} home`}>
          {business.logo ? (
            <Image src={`/${business.logo}`} alt={`${business.businessName} logo`} width={150} height={44} className="h-11 w-auto max-w-[150px] object-contain rounded" />
          ) : (
            <span className="text-[26px] font-extrabold text-storefront-green-dark tracking-wide">{business.businessName}</span>
          )}
        </Link>

        {business.location && (
          <div className="flex items-center gap-1.5 px-3 h-11 bg-storefront-green-light rounded-lg text-sm whitespace-nowrap shrink-0">
            <MapPin className="w-[18px] h-[18px] text-storefront-green shrink-0" />
            <span className="font-bold">{business.location.length > 12 ? `${business.location.slice(0, 12)}` : business.location}</span>
          </div>
        )}

        {business.businessHours && (
          <div className="text-[13px] whitespace-nowrap shrink-0 text-[#333]">
            <span className="text-storefront-green font-bold">We&apos;re open</span>
            <div className="flex items-center gap-1.5 font-bold mt-0.5">
              <Clock className="w-3.5 h-3.5 text-storefront-orange" />
              {business.businessHours}
            </div>
          </div>
        )}

        <form action="/shop" method="GET" className="flex-1 min-w-[200px] flex h-11">
          <input
            type="text"
            name="q"
            placeholder="Search for products"
            defaultValue={currentQ}
            className="flex-1 border border-storefront-border border-r-0 rounded-l-md px-4 text-sm outline-none text-[#333] placeholder:text-[#8a8a8a]"
          />
          <button type="submit" className="bg-storefront-green hover:bg-storefront-green-dark text-white px-[26px] rounded-r-md font-bold text-[13px] tracking-wide">
            SEARCH
          </button>
        </form>

        <div className="flex items-center gap-[26px] ml-auto whitespace-nowrap shrink-0">
          <Link href={customer ? "/shop/account" : "/shop/login"} className="flex items-center gap-1.5 text-sm font-semibold text-[#333]">
            <User className="w-[22px] h-[22px] text-storefront-green shrink-0" strokeWidth={1.8} />
            <span>{customer ? customer.name.split(" ")[0] : "Sign In / Register"}</span>
          </Link>
          <Link href="/shop/wishlist" className="flex items-center gap-1.5 text-sm font-semibold text-[#333]" aria-label="Wishlist">
            <Heart className="w-[22px] h-[22px] text-storefront-green shrink-0" strokeWidth={1.8} />
          </Link>
          <Link href="/shop/cart" className="flex items-center gap-1.5 relative text-sm font-semibold text-[#333]">
            <div className="relative">
              <ShoppingCart className="w-[22px] h-[22px] text-storefront-green shrink-0" strokeWidth={1.8} />
              <span className="absolute -top-[9px] left-[13px] bg-[#fdd835] text-[#333] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {count}
              </span>
            </div>
            <span>₹{total.toLocaleString("en-IN")}</span>
          </Link>
        </div>
      </header>

      {/* Category nav bar */}
      <nav className="hidden md:flex gap-8 px-8 py-3.5 border-b border-storefront-border bg-white overflow-x-auto text-sm font-semibold">
        <Link
          href="/shop"
          className={cn("whitespace-nowrap text-sm font-medium", pathname === "/shop" && !currentSlug ? "text-storefront-green" : "text-storefront-text")}
        >
          All Categories
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            href={`/shop/category?slug=${encodeURIComponent(cat.slug)}`}
            className={cn("whitespace-nowrap text-sm font-medium", currentSlug === cat.slug ? "text-storefront-green" : "text-storefront-text")}
          >
            {cat.name}
          </Link>
        ))}
      </nav>

      {/* ============ MOBILE HEADER ============ */}
      <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-storefront-border bg-white">
        <button onClick={onOpenMobileMenu} aria-label="Open menu">
          <Menu className="w-6 h-6" />
        </button>
        <Link href="/shop" aria-label={`${business.businessName} home`}>
          {business.logo ? (
            <Image src={`/${business.logo}`} alt={`${business.businessName} logo`} width={100} height={32} className="h-8 w-auto object-contain" />
          ) : (
            <span className="text-lg font-extrabold text-storefront-green-dark">{business.businessName}</span>
          )}
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/shop/wishlist"><Heart className="w-5 h-5" /></Link>
          <Link href="/shop/cart" className="relative">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute -top-2 -right-2 bg-storefront-orange text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {count}
            </span>
          </Link>
          <Link href={customer ? "/shop/account" : "/shop/login"}><User className="w-5 h-5" /></Link>
        </div>
      </div>
      <form action="/shop" method="GET" className="md:hidden px-4 py-2 bg-white border-b border-storefront-border">
        <div className="flex items-center gap-2 bg-storefront-bg rounded-full px-3 py-2">
          <Search className="w-4 h-4 text-storefront-muted" />
          <input
            type="text"
            name="q"
            placeholder="Search for products"
            defaultValue={currentQ}
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </form>
    </>
  );
}
