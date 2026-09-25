"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LogIn, LogOut, MapPin, Package, UserPlus, UserRound, X } from "lucide-react";
import { SocialIcon } from "./SocialIcon";
import { PushBell } from "./push/PushContext";
import { SidebarMenu, type ResolvedItem } from "./menu/StoreMenus";
import type { ShopBusinessSettings, ShopCustomer, ShopHeaderSettings } from "@/types/shop";
import type { MenuDesign } from "@/types/storefront";
import { cn } from "@/lib/utils";

interface ShopMobileDrawerProps {
  business: ShopBusinessSettings;
  header: ShopHeaderSettings;
  customer: ShopCustomer | null;
  menu: ResolvedItem[];
  design: MenuDesign;
  isOpen: boolean;
  onClose: () => void;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/**
 * Mobile sidebar, top to bottom:
 *   location (same short place + address as the header) · bell until subscribed · close
 *   profile — avatar + name + View Profile, or Login / Sign up
 *   menu from Business Settings → Sidebar Menu (dropdowns like the reference drawer)
 *   Follow Us — the store's social links
 * Shown below the shop's 901px breakpoint, the same one the header switches at.
 */
export function ShopMobileDrawer({ business, header, customer, menu, design, isOpen, onClose }: ShopMobileDrawerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showLocation = header.showLocation && !!business.location;

  // Close on navigation and on Escape; lock page scroll while open.
  useEffect(() => { onClose(); }, [pathname, searchParams, onClose]);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [isOpen, onClose]);

  const isActive = (href: string) => {
    const [path, query = ""] = href.split("#")[0].split("?");
    if (path !== pathname) return false;
    const slug = new URLSearchParams(query).get("slug");
    // Same rule as the header: #anchor links (e.g. All Categories) never mark the page itself as current.
    return slug ? searchParams?.get("slug") === slug : path !== "/category" && !href.includes("#");
  };

  return (
    <>
      <div className={cn("fixed inset-0 z-[999] bg-black/45 transition-opacity shop:hidden", isOpen ? "visible opacity-100" : "invisible opacity-0")} onClick={onClose} />
      <aside aria-label="Mobile Navigation" aria-hidden={!isOpen} inert={!isOpen}
        className={cn("fixed bottom-0 left-0 top-0 z-[1001] flex w-[min(340px,85vw)] flex-col bg-white font-storefront text-[#353543] shop:hidden",
          "shadow-[6px_0_24px_rgba(0,0,0,0.18)] transition-transform duration-[240ms] ease-[cubic-bezier(.23,1,.32,1)]",
          isOpen ? "translate-x-0" : "-translate-x-[105%]")}
        style={{ ["--menu-accent" as string]: design.accent }}>

        {/* Store / location · bell · close */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#eaeaf2] pl-4 pr-2">
          {showLocation ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <MapPin className="h-[18px] w-[18px] shrink-0 text-[#5d7eea]" fill="#8aa4f4" strokeWidth={1.6} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[14px] font-semibold text-[#353543]">{clip(business.location ?? "", 26)}</span>
                {business.address && <span className="block truncate text-[11.5px] text-[#8b8ba3]">{business.address}</span>}
              </span>
            </div>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[17px] font-bold" style={{ color: design.accent }}>{business.businessName}</span>
          )}
          <PushBell className="h-10 w-10 rounded-full text-[#353543] hover:bg-[#f8f9fe]" iconClassName="h-[21px] w-[21px]" />
          <button type="button" onClick={onClose} aria-label="Close menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#666] hover:bg-[#f8f9fe]">
            <X className="h-[22px] w-[22px]" strokeWidth={2} />
          </button>
        </div>

        {/* Profile — buttons styled like Meesho's Add to Cart (outline) / Buy Now (solid) */}
        <div className="shrink-0 bg-[#f8f9fe] px-4 pb-4 pt-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#feeff6] text-[17px] font-bold" style={{ color: design.accent }}>
              {customer ? customer.name.trim().charAt(0).toUpperCase() : <UserRound className="h-[22px] w-[22px]" strokeWidth={1.8} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold text-[#353543]">{customer ? `Hello, ${customer.name.split(" ")[0]}` : "Hello, Guest"}</p>
              <p className="truncate text-[12px] text-[#8b8ba3]">{customer ? "Welcome back!" : `Login to see your orders & wishlist`}</p>
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            {customer ? <>
              <Link href="/account#orders" onClick={onClose} className="flex h-10 items-center justify-center gap-1.5 rounded-[4px] border bg-white text-[15px] font-medium" style={{ borderColor: design.accent, color: design.accent }}>
                <Package className="h-[18px] w-[18px]" strokeWidth={1.9} />My Orders
              </Link>
              <Link href="/account" onClick={onClose} className="flex h-10 items-center justify-center gap-1.5 rounded-[4px] text-[15px] font-medium text-white" style={{ background: design.accent }}>
                <UserRound className="h-[18px] w-[18px]" strokeWidth={1.9} />Profile
              </Link>
            </> : <>
              <Link href="/register" onClick={onClose} className="flex h-10 items-center justify-center gap-1.5 rounded-[4px] border bg-white text-[15px] font-medium" style={{ borderColor: design.accent, color: design.accent }}>
                <UserPlus className="h-[18px] w-[18px]" strokeWidth={1.9} />Sign up
              </Link>
              <Link href="/login" onClick={onClose} className="flex h-10 items-center justify-center gap-1.5 rounded-[4px] text-[15px] font-medium text-white" style={{ background: design.accent }}>
                <LogIn className="h-[18px] w-[18px]" strokeWidth={1.9} />Login
              </Link>
            </>}
          </div>
        </div>
        <div className="h-2 shrink-0 bg-[#eaeaf2]" aria-hidden />

        {/* Menu */}
        <nav aria-label="Menu" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <SidebarMenu items={menu} design={design} isActive={isActive} onNavigate={onClose} />
          {customer && (
            <form action="/api/auth/customer-logout" method="POST" className={cn(design.dividers && "border-b border-[#eaeaf2]")}>
              <button type="submit" className="flex min-h-[50px] w-full items-center gap-3.5 px-4 text-left text-[15px] text-[#e5485f]">
                {design.showIcons && <LogOut className="h-5 w-5" strokeWidth={1.7} />}Logout
              </button>
            </form>
          )}
        </nav>

        {/* Follow us */}
        {!!business.socialMedia?.length && (
          <div className="shrink-0 border-t border-[#eaeaf2] bg-[#f8f9fe] px-4 py-3.5">
            <p className="mb-2.5 text-[13px] font-medium text-[#8b8ba3]">Follow Us</p>
            <div className="flex flex-wrap gap-2.5">
              {business.socialMedia.map((s) => (
                <a key={s.platform + s.url} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.platform}
                  className="grid h-9 w-9 place-items-center rounded-full text-white transition-transform active:scale-90" style={{ background: design.accent }}>
                  <SocialIcon platform={s.platform} className="h-4 w-4 fill-white text-white" />
                </a>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
