"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Heart, House, LayoutGrid, ShoppingCart, UserRound } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { OPEN_CATEGORIES_EVENT } from "./CategoryCircles";

/**
 * Meesho's bottom tab bar on phones/tablets (below the header's 901px
 * breakpoint): Home · Categories · Wishlist · Cart · Account, grey outline
 * icons with the active tab in the accent colour. Pads the page bottom while
 * shown so the footer isn't hidden behind it.
 */
export function MobileBottomNav({ loggedIn }: { loggedIn: boolean }) {
  const { count } = useCart();
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const root = document.documentElement;
    const apply = () => {
      document.body.style.paddingBottom = mq.matches ? "58px" : "";
      if (mq.matches) root.style.setProperty("--fcb-offset", "58px"); else root.style.removeProperty("--fcb-offset"); // floating cart bar sits above
    };
    apply();
    mq.addEventListener("change", apply);
    return () => { mq.removeEventListener("change", apply); document.body.style.paddingBottom = ""; root.style.removeProperty("--fcb-offset"); };
  }, []);
  const item = "flex flex-col items-center justify-center gap-[3px] text-[11.5px] leading-none text-[#8b8ba3]";
  const icon = "h-6 w-6 text-[#666]";
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-[900] grid h-[58px] grid-cols-5 bg-white shadow-[0_-1px_6px_rgba(0,0,0,0.08)] shop:hidden">
      <Link href="/" aria-current="page" className={`${item} font-medium !text-[#353543]`}>
        <House className="h-6 w-6 text-[var(--hp-accent)]" strokeWidth={2} fill="currentColor" fillOpacity={0.9} />Home
      </Link>
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CATEGORIES_EVENT))} className={item}><LayoutGrid className={icon} strokeWidth={1.5} />Categories</button>
      <Link href="/wishlist" className={item}><Heart className={icon} strokeWidth={1.5} />Wishlist</Link>
      <Link href="/cart" className={`${item} relative`}>
        <ShoppingCart className={icon} strokeWidth={1.5} />Cart
        {count > 0 && <span className="absolute left-1/2 top-1.5 ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--hp-accent)] px-1 text-[10px] font-bold text-white">{count}</span>}
      </Link>
      <Link href={loggedIn ? "/account" : "/login"} className={item}><UserRound className={icon} strokeWidth={1.5} />{loggedIn ? "Account" : "Login"}</Link>
    </nav>
  );
}
