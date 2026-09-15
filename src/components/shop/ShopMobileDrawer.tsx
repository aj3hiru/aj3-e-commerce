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
 * Verified against shop/includes/shop-footer.php lines 18-80: the mobile
 * drawer shows a welcome message (with the customer's first name if logged
 * in), Sign In/Register or Logout, then Home / All Categories / My Orders /
 * Wishlist / My Cart (My Orders + Wishlist only if logged in), then a social
 * links row if any social_media_json entries exist.
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
          "fixed top-0 left-0 bottom-0 w-[85%] max-w-[320px] bg-white z-[1000] overflow-y-auto transition-transform md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 border-b border-storefront-border">
          <div className="flex justify-end mb-3">
            <button onClick={onClose} aria-label="Close menu">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <UserCircle className="w-6 h-6 text-storefront-green" />
            <span className="text-sm">
              {customer ? `Welcome, ${customer.name.split(" ")[0]}!` : `Welcome to ${business.businessName}!`}
            </span>
          </div>
          <Link
            href={customer ? "/shop/logout" : "/shop/login"}
            className="block text-center bg-storefront-green text-white rounded py-2 text-sm font-semibold"
          >
            {customer ? "Logout" : "Sign In / Register"}
          </Link>
        </div>

        <nav className="p-2" onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) onClose();
        }}>
          <Link href="/shop" className="flex items-center gap-3 px-3 py-3 text-sm">
            <LayoutGrid className="w-5 h-5" /> Home
          </Link>
          <Link href="/shop#categories" className="flex items-center gap-3 px-3 py-3 text-sm">
            <LayoutGrid className="w-5 h-5" /> All Categories
          </Link>
          {customer && (
            <>
              <Link href="/shop/account#orders" className="flex items-center gap-3 px-3 py-3 text-sm">
                <ClipboardList className="w-5 h-5" /> My Orders
              </Link>
              <Link href="/shop/wishlist" className="flex items-center gap-3 px-3 py-3 text-sm">
                <Heart className="w-5 h-5" /> Wishlist
              </Link>
            </>
          )}
          <Link href="/shop/cart" className="flex items-center gap-3 px-3 py-3 text-sm">
            <ShoppingCart className="w-5 h-5" /> My Cart
          </Link>
        </nav>

        {!!business.socialMedia?.length && (
          <div className="p-4 border-t border-storefront-border">
            <p className="text-xs text-storefront-muted mb-2">Follow Us on Social Media</p>
            <div className="flex gap-3">
              {business.socialMedia.map((s) => (
                <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.platform}>
                  <SocialIcon platform={s.platform} className="w-5 h-5 text-storefront-text" />
                </a>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
