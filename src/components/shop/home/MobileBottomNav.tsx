"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Heart, House, LayoutGrid, ShoppingCart, UserRound } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { OPEN_CATEGORIES_EVENT } from "./CategoryCircles";

/**
 * Meesho's bottom tab bar, on the home page on phones/tablets (below the
 * header's 901px breakpoint): Home · Categories · Wishlist · Cart · Account.
 * Pads the page bottom while shown so the footer isn't hidden behind it.
 */
export function MobileBottomNav({ loggedIn }: { loggedIn: boolean }) {
  const { count } = useCart();
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => { document.body.style.paddingBottom = mq.matches ? "64px" : ""; };
    apply();
    mq.addEventListener("change", apply);
    return () => { mq.removeEventListener("change", apply); document.body.style.paddingBottom = ""; };
  }, []);
  const item = "flex flex-col items-center justify-center gap-1 text-[11px] text-[#8c899c]";
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-[900] grid h-16 grid-cols-5 border-t border-[#dedde5] bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.04)] shop:hidden">
      <Link href="/shop" aria-current="page" className={`${item} font-bold text-storefront-green`}><House className="h-6 w-6" strokeWidth={2} fill="currentColor" fillOpacity={0.15} />Home</Link>
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CATEGORIES_EVENT))} className={item}><LayoutGrid className="h-6 w-6" strokeWidth={1.8} />Categories</button>
      <Link href="/shop/wishlist" className={item}><Heart className="h-6 w-6" strokeWidth={1.8} />Wishlist</Link>
      <Link href="/shop/cart" className={`${item} relative`}>
        <ShoppingCart className="h-6 w-6" strokeWidth={1.8} />Cart
        {count > 0 && <span className="absolute left-1/2 top-1.5 ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white">{count}</span>}
      </Link>
      <Link href={loggedIn ? "/shop/account" : "/shop/login"} className={item}><UserRound className="h-6 w-6" strokeWidth={1.8} />{loggedIn ? "Account" : "Login"}</Link>
    </nav>
  );
}
