"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LogIn, MapPin, UserPlus, UserRound, X } from "lucide-react";
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
    return slug ? searchParams?.get("slug") === slug : !searchParams?.get("slug") || path !== "/shop/category";
  };

  return (
    <>
      <div className={cn("fixed inset-0 z-[999] bg-black/45 transition-opacity shop:hidden", isOpen ? "visible opacity-100" : "invisible opacity-0")} onClick={onClose} />
      <aside aria-label="Mobile Navigation" aria-hidden={!isOpen} inert={!isOpen}
        className={cn("fixed bottom-0 left-0 top-0 z-[1001] flex w-[min(360px,86vw)] flex-col bg-white shop:hidden",
          "shadow-[6px_0_24px_rgba(0,0,0,0.18)] transition-transform duration-[240ms] ease-[cubic-bezier(.23,1,.32,1)]",
          isOpen ? "translate-x-0" : "-translate-x-[105%]")}
        style={{ ["--menu-accent" as string]: design.accent }}>

        {/* Location · bell · close */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-storefront-border px-4 py-3">
          {showLocation ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-storefront-green-light px-2.5 py-1.5">
              <MapPin className="h-[18px] w-[18px] shrink-0 text-storefront-green" fill="currentColor" strokeWidth={0} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-bold text-storefront-text">{clip(business.location ?? "", 22)}</span>
                {business.address && <span className="block truncate text-[11px] text-storefront-muted">{business.address}</span>}
              </span>
            </div>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-storefront-green-dark">{business.businessName}</span>
          )}
          <PushBell className="h-9 w-9 rounded-full border border-storefront-border text-storefront-green" iconClassName="h-[18px] w-[18px]" />
          <button type="button" onClick={onClose} aria-label="Close menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-storefront-border text-[#333] hover:border-storefront-green hover:text-storefront-green">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Profile */}
        <div className="shrink-0 border-b border-storefront-border px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${design.accent}, color-mix(in srgb, ${design.accent} 60%, black))` }}>
              {customer ? customer.name.trim().charAt(0).toUpperCase() : <UserRound className="h-6 w-6" strokeWidth={2} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-storefront-text">{customer ? customer.name : "Hello, Guest"}</p>
              <p className="truncate text-xs text-storefront-muted">{customer ? "Welcome back!" : `Welcome to ${business.businessName}`}</p>
            </div>
          </div>
          {customer ? (
            <Link href="/shop/account" onClick={onClose}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border-2 text-sm font-semibold transition-colors hover:text-white"
              style={{ borderColor: design.accent, color: design.accent }}
              onMouseEnter={(e) => { e.currentTarget.style.background = design.accent; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ""; e.currentTarget.style.color = design.accent; }}>
              <UserRound className="h-4 w-4" /> View Profile
            </Link>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/shop/login" onClick={onClose} className="flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: design.accent }}>
                <LogIn className="h-4 w-4" /> Login
              </Link>
              <Link href="/shop/register" onClick={onClose} className="flex h-10 items-center justify-center gap-1.5 rounded-lg border-2 text-sm font-semibold" style={{ borderColor: design.accent, color: design.accent }}>
                <UserPlus className="h-4 w-4" /> Sign up
              </Link>
            </div>
          )}
        </div>

        {/* Menu */}
        <nav aria-label="Menu" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-storefront-muted">Menu</p>
          <SidebarMenu items={menu} design={design} isActive={isActive} onNavigate={onClose} />
          {customer && (
            <form action="/api/auth/customer-logout" method="POST" className="px-4 py-4">
              <button type="submit" className="text-sm font-semibold text-red-600 hover:underline">Logout</button>
            </form>
          )}
        </nav>

        {/* Follow us */}
        {!!business.socialMedia?.length && (
          <div className="shrink-0 border-t border-storefront-border bg-storefront-bg px-4 py-3.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-storefront-muted">Follow Us</p>
            <div className="flex flex-wrap gap-2.5">
              {business.socialMedia.map((s) => (
                <a key={s.platform + s.url} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.platform}
                  className="grid h-9 w-9 place-items-center rounded-full text-white transition-transform hover:-translate-y-0.5" style={{ background: design.accent }}>
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
