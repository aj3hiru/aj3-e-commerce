"use client";

import Link from "next/link";
import { X, UserCircle, LayoutGrid, ClipboardList, Heart, ShoppingCart } from "lucide-react";
import { SocialIcon } from "./SocialIcon";
import type { ShopBusinessSettings, ShopCustomer } from "@/types/shop";
import { cn } from "@/lib/utils";

interface ShopMobileDrawerProps {
  business: ShopBusinessSettings;
  customer: ShopCustomer | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Verified against #sidebar CSS + markup in shop-header.php (lines 665-746)
 * and shop-footer.php (lines 18-80) — REBUILT after discovering the first
 * pass used the wrong accent color (green instead of the drawer's own
 * `--drawer-accent:#7c3aed`, a purple distinct from the storefront's main
 * green) and was missing the dedicated top action-bar row, the exact
 * avatar/signin-button styling, and the bordered social-link circles
 * (solid purple background, not an outline).
 */
export function ShopMobileDrawer({ business, customer, isOpen, onClose }: ShopMobileDrawerProps) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-[999] transition-opacity md:hidden",
          isOpen ? "opacity-100 visible" : "opacity-0 invisible"
        )}
        onClick={onClose}
      />
      <aside
        aria-label="Mobile Navigation"
        aria-hidden={!isOpen}
        className={cn(
          "fixed top-0 left-0 bottom-0 w-[min(380px,88vw)] bg-white z-[1001] flex flex-col md:hidden",
          "shadow-[0_16px_40px_rgba(124,58,237,0.18)] transition-transform duration-[250ms] ease-out",
          isOpen ? "translate-x-0" : "-translate-x-[101%]"
        )}
      >
        <div className="shrink-0 border-b border-[#ebe5ff]">
          <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-4 py-3">
            <button
              onClick={onClose}
              aria-label="Close Menu"
              className="w-[34px] h-[34px] grid place-items-center rounded-full border border-[#ebe5ff] text-[#1d1d1f] hover:text-[#7c3aed] hover:border-[#7c3aed] transition-colors"
            >
              <X className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>

          <div className="px-5 pt-2 pb-4">
            <div className="flex items-center gap-3 mb-4 text-[15px] font-bold text-[#1d1d1f]">
              <span className="grid place-items-center shrink-0 w-11 h-11 rounded-full bg-[#f0f0f0] text-[#7c3aed]">
                <UserCircle className="w-[22px] h-[22px]" strokeWidth={1.8} />
              </span>
              <span>{customer ? `Welcome, ${customer.name.split(" ")[0]}!` : `Welcome to ${business.businessName}!`}</span>
            </div>
            {customer ? (
              /* POST form, not a <Link> — see AdminHeader/logout route notes.
                 (The first pass linked to "/shop/logout", which was also a dead
                 route that never existed — it 404'd rather than logging out.) */
              <form action="/api/auth/customer-logout" method="POST">
                <button
                  type="submit"
                  className="block w-full py-3 rounded-lg bg-[#7c3aed] text-white text-[15px] font-bold text-center hover:opacity-90 transition-opacity"
                >
                  Logout
                </button>
              </form>
            ) : (
              // shop-footer.php's `.sidebar-signin` still reads "Sign In /
              // Register", but the store owner asked for the auth link to say
              // just "Login". The desktop header in the latest PHP already
              // says "Login", so matching it here keeps the two consistent
              // rather than showing a different word on mobile.
              <Link
                href="/shop/login"
                className="block w-full py-3 rounded-lg bg-[#7c3aed] text-white text-[15px] font-bold text-center hover:opacity-90 transition-opacity"
              >
                Login
              </Link>
            )}
          </div>
        </div>

        <nav
          className="flex-1 min-h-0 overflow-y-auto py-4 px-3"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) onClose();
          }}
        >
          <Link href="/shop" className="flex items-center gap-3 w-full p-3 text-[15px] text-[#1d1d1f] hover:text-[#7c3aed]">
            <LayoutGrid className="w-[22px] h-[22px] shrink-0" strokeWidth={1.8} /> Home
          </Link>
          <Link href="/shop#categories" className="flex items-center gap-3 w-full p-3 text-[15px] text-[#1d1d1f] hover:text-[#7c3aed]">
            <LayoutGrid className="w-[22px] h-[22px] shrink-0" strokeWidth={1.8} /> All Categories
          </Link>
          {customer && (
            <>
              <Link href="/shop/account#orders" className="flex items-center gap-3 w-full p-3 text-[15px] text-[#1d1d1f] hover:text-[#7c3aed]">
                <ClipboardList className="w-[22px] h-[22px] shrink-0" strokeWidth={1.8} /> My Orders
              </Link>
              <Link href="/shop/wishlist" className="flex items-center gap-3 w-full p-3 text-[15px] text-[#1d1d1f] hover:text-[#7c3aed]">
                <Heart className="w-[22px] h-[22px] shrink-0" strokeWidth={1.8} /> Wishlist
              </Link>
            </>
          )}
          <Link href="/shop/cart" className="flex items-center gap-3 w-full p-3 text-[15px] text-[#1d1d1f] hover:text-[#7c3aed]">
            <ShoppingCart className="w-[22px] h-[22px] shrink-0" strokeWidth={1.8} /> My Cart
          </Link>
        </nav>

        {!!business.socialMedia?.length && (
          <div className="shrink-0 px-5 pt-3 pb-4 border-t border-[#ebe5ff] bg-[#f7f7f7] text-center">
            <p className="text-[13px] text-[#555] mb-2">Follow Us on Social Media</p>
            <div className="flex flex-wrap justify-center gap-2">
              {business.socialMedia.map((s) => (
                <a
                  key={s.platform}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.platform}
                  className="grid place-items-center w-9 h-9 rounded-full bg-[#7c3aed] hover:opacity-85 hover:-translate-y-0.5 transition-all"
                >
                  <SocialIcon platform={s.platform} className="w-5 h-5 fill-white text-white" />
                </a>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
