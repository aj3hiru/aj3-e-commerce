"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faCube, faTimes, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { ADMIN_NAV, hasPermission, type NavLink, type NavParent } from "@/lib/admin-nav-config";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  siteName: string;
  permissions: Record<string, Record<string, boolean>>;
  isOpen: boolean;
  onClose: () => void;
}

/*
 * Every metric below is copied from the two PHP stylesheets that draw this
 * sidebar — ecom-head.php (the base rules) and sidebar-nav.php (its own
 * <style> block). Literal values are used throughout instead of Tailwind's
 * scale, because this project's tailwind.config redefines `rounded`/`rounded-lg`
 * for the admin tokens and several spacing steps here fall between Tailwind's.
 *
 *   .nav-section  { margin-bottom:1.5rem; padding:0 1rem }
 *   .nav-title    { .6875rem / 700 / uppercase / letter-spacing .1em / gray-400;
 *                   padding:0 1rem; margin-bottom:.75rem }
 *   .nav-link     { gap:.875rem; padding:.875rem 1rem; radius .5rem; gray-600;
 *                   .9375rem / 500; margin-bottom:.25rem }
 *   .nav-link:hover  { bg gray-50; gray-900 }
 *   .nav-link.active { bg primary-lighter; primary; 600 }
 *   .nav-link i   { width:24px; text-align:center; font-size:1.125rem }
 *   .nav-submenu .nav-link { padding-left:2.75rem; font-size:.875rem }
 *   .nav-expand-btn { 36×36; gray-400; radius .5rem; chevron .75rem, rotates 180° }
 */
const LINK_BASE =
  "flex items-center gap-[0.875rem] rounded-[0.5rem] py-[0.875rem] pr-4 font-medium transition-all duration-200";
const LINK_IDLE = "text-[#4b5563] hover:bg-[#f9fafb] hover:text-[#111827]";
const LINK_ACTIVE = "bg-[#f5f3ff] text-[#7c3aed] font-semibold";

/** `.nav-link i` — a 24px-wide slot so every label starts on the same x. */
function NavIcon({ icon }: { icon: IconDefinition }) {
  return (
    <span className="inline-flex w-6 items-center justify-center text-[1.125rem] leading-none">
      <FontAwesomeIcon icon={icon} />
    </span>
  );
}

export function AdminSidebar(props: AdminSidebarProps) {
  // useSearchParams() needs a Suspense boundary during static build.
  // The fallback is an empty sidebar of the same size, not null: with null,
  // while the real sidebar loads the page content slid into the 280px
  // sidebar column and the header was crushed (title wrapping word by word).
  return (
    <Suspense fallback={<SidebarPlaceholder />}>
      <AdminSidebarInner {...props} />
    </Suspense>
  );
}

/** Same footprint as the real sidebar on desktop; nothing on mobile, where the real one is off-canvas. */
function SidebarPlaceholder() {
  return (
    <aside
      aria-hidden="true"
      className="hidden w-[280px] border-r border-[#e5e7eb] bg-white lg:sticky lg:top-0 lg:block lg:h-screen"
    />
  );
}

function AdminSidebarInner({ siteName, permissions, isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navRef = useRef<HTMLElement>(null);

  // Submenu defaults mirror sidebar-nav.php: Products open always; Categories
  // and Orders open only when you are on one of their pages.
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({
    "submenu-products": true,
    "submenu-categories": pathname === "/admin/ecommerce/categories" || pathname === "/admin/ecommerce/subcategories",
    "submenu-orders": pathname?.startsWith("/admin/ecommerce/orders") ?? false,
  });

  useEffect(() => {
    // Saved choice wins over the default — the PHP's localStorage 'nav_<id>'.
    setOpenSubmenus((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        try {
          const saved = window.localStorage.getItem(`nav_${id}`);
          if (saved !== null) next[id] = saved === "1";
        } catch {
          /* storage blocked — keep the default */
        }
      }
      return next;
    });
    // PHP scrolls the active link into view on load, so a deep page like
    // "Print Barcodes" isn't hidden below the fold of a long sidebar.
    const active = navRef.current?.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSubmenu(id: string) {
    setOpenSubmenus((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(`nav_${id}`, next[id] ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function isActive(link: NavLink, isSubItem = false): boolean {
    if (link.matchQuery) {
      const [path] = link.href.split("?");
      return pathname === path && searchParams?.get(link.matchQuery.key) === link.matchQuery.value;
    }
    // "All Orders" is active only on the unfiltered list, as in the PHP.
    if (link.href === "/admin/ecommerce/orders" && !isSubItem) {
      return pathname === "/admin/ecommerce/orders" && !searchParams?.get("type");
    }
    return pathname === link.href;
  }

  function renderLink(link: NavLink, opts: { sub?: boolean; flex?: boolean } = {}) {
    const active = isActive(link, opts.sub);
    const cls = cn(
      LINK_BASE,
      opts.sub ? "pl-[2.75rem] text-[0.875rem]" : "pl-4 text-[0.9375rem]",
      opts.flex ? "mb-0 flex-1" : "mb-1",
      active ? LINK_ACTIVE : LINK_IDLE
    );

    // Logout must be a POST form, never a link. The PHP linked to a GET
    // logout URL; here the route is POST-only because Next.js prefetches any
    // <Link> in the viewport, and a prefetchable logout link was signing
    // admins out on page load. A <Link> to it would now just 405.
    if (link.isLogout) {
      return (
        <form key={link.href} method="POST" action={link.href}>
          <button type="submit" className={cn(cls, "w-full text-left")}>
            <NavIcon icon={link.icon} />
            {link.label}
          </button>
        </form>
      );
    }

    return (
      <Link key={link.href} href={link.href} data-active={active ? "true" : undefined} className={cls}>
        <NavIcon icon={link.icon} />
        {link.label}
      </Link>
    );
  }

  return (
    <>
      {/* .sidebar-overlay */}
      <div
        className={cn(
          "fixed inset-0 z-[999] bg-black/50 transition-all duration-300 lg:hidden",
          isOpen ? "visible opacity-100" : "invisible opacity-0"
        )}
        onClick={onClose}
      />

      {/* .sidebar */}
      <aside
        className={cn(
          "fixed bottom-0 left-0 top-0 z-[1000] flex w-[280px] flex-col overflow-y-auto border-r border-[#e5e7eb] bg-white",
          "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "lg:sticky lg:h-screen lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* .sidebar-header { padding:1.5rem; border-bottom:1px solid gray-100 } */}
        <div className="flex items-center justify-between border-b border-[#f3f4f6] p-6">
          {/* .brand { gap:.65rem; 1.15rem / 800 / primary } */}
          <Link href="/admin/dashboard" className="flex items-center gap-[0.65rem] text-[1.15rem] font-extrabold text-[#7c3aed]">
            {/* .brand-icon { 40×40; gradient; radius .75rem; 1.25rem } */}
            <span className="flex h-10 w-10 items-center justify-center rounded-[0.75rem] bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] text-[1.25rem] text-white">
              <FontAwesomeIcon icon={faCube} />
            </span>
            <span>{siteName}</span>
          </Link>
          {/* .close-sidebar { 36×36; gray-100; radius .5rem; gray-600 } */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-[0.5rem] bg-[#f3f4f6] text-[#4b5563] transition-all duration-200 hover:bg-[#e5e7eb] lg:hidden"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* .sidebar-nav { flex:1; padding:1rem 0; overflow-y:auto } */}
        <nav ref={navRef} className="admin-sidebar-nav flex-1 overflow-y-auto py-4">
          {ADMIN_NAV.map((section) => {
            if (!hasPermission(permissions, section.permission)) return null;

            const visibleLinks = section.links.filter((l) => hasPermission(permissions, l.permission));
            if (visibleLinks.length === 0) return null;

            return (
              <div key={section.title} className="mb-6 px-4">
                <div className="mb-3 px-4 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-[#9ca3af]">
                  {section.title}
                </div>

                {visibleLinks.map((link: NavParent) => {
                  const submenu = (link.submenu ?? []).filter((s) => hasPermission(permissions, s.permission));
                  if (!link.submenuId || submenu.length === 0) return renderLink(link);

                  const open = openSubmenus[link.submenuId] ?? !!link.defaultOpen;
                  return (
                    <div key={link.href}>
                      {/* .nav-parent-row */}
                      <div className="mb-1 flex items-center">
                        {renderLink(link, { flex: true })}
                        <button
                          type="button"
                          aria-label={`${open ? "Collapse" : "Expand"} ${link.label}`}
                          aria-expanded={open}
                          onClick={() => toggleSubmenu(link.submenuId!)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.5rem] text-[#9ca3af] transition-[transform,background] duration-200 hover:bg-[#f9fafb]"
                        >
                          <span className={cn("text-[0.75rem] transition-transform duration-200", open && "rotate-180")}>
                            <FontAwesomeIcon icon={faChevronDown} />
                          </span>
                        </button>
                      </div>
                      {/* .nav-submenu { max-height 0 → 600px, .25s ease } */}
                      <div
                        className={cn(
                          "overflow-hidden transition-[max-height] duration-[250ms] ease-in-out",
                          open ? "max-h-[600px]" : "max-h-0"
                        )}
                      >
                        {submenu.map((sub) => renderLink(sub, { sub: true }))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
