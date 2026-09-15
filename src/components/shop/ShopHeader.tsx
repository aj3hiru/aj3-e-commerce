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
      <header className="hidden md:flex items-center gap-4 px-6 py-4 border-b border-storefront-border bg-white">
        <Link href="/shop" className="flex items-center" aria-label={`${business.businessName} home`}>
          {business.logo ? (
            <Image src={`/${business.logo}`} alt={`${business.businessName} logo`} width={140} height={48} className="h-12 w-auto object-contain" />
          ) : (
            <span className="text-xl font-extrabold text-storefront-green-dark">{business.businessName}</span>
          )}
        </Link>

        {business.location && (
          <div className="flex items-center gap-1.5 text-sm text-storefront-muted">
            <MapPin className="w-4 h-4 text-storefront-green" />
            <span className="truncate max-w-[12ch]">{business.location}</span>
          </div>
        )}

        {business.businessHours && (
          <div className="flex flex-col text-sm">
            <span className="text-storefront-muted text-xs">We&apos;re open</span>
            <div className="flex items-center gap-1.5 font-medium">
              <Clock className="w-4 h-4" />
              {business.businessHours}
            </div>
          </div>
        )}

        <form action="/shop" method="GET" className="flex-1 flex max-w-xl">
          <input
            type="text"
            name="q"
            placeholder="Search for products"
            defaultValue={currentQ}
            className="flex-1 border border-storefront-border rounded-l px-4 py-2 focus:outline-none focus:border-storefront-green"
          />
          <button type="submit" className="bg-storefront-green hover:bg-storefront-green-dark text-white px-5 rounded-r font-semibold text-sm">
            SEARCH
          </button>
        </form>

        <div className="flex items-center gap-5 ml-auto">
          <Link href={customer ? "/shop/account" : "/shop/login"} className="flex flex-col items-center text-sm">
            <User className="w-5 h-5" />
            <span>{customer ? customer.name.split(" ")[0] : "Sign In / Register"}</span>
          </Link>
          <Link href="/shop/wishlist" aria-label="Wishlist">
            <Heart className="w-5 h-5" />
          </Link>
          <Link href="/shop/cart" className="flex items-center gap-1.5">
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-2 -right-2 bg-storefront-orange text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {count}
              </span>
            </div>
            <span className="font-semibold text-sm">₹{total.toLocaleString("en-IN")}</span>
          </Link>
        </div>
      </header>

      {/* Category nav bar */}
      <nav className="hidden md:flex gap-6 px-6 py-3 border-b border-storefront-border bg-white overflow-x-auto">
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
