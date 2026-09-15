"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import {
  Home, Boxes, PlusSquare, Copyright, PackageOpen, Percent, FileSpreadsheet,
  StarHalf, Barcode, Tags, List, ListTree, Receipt, Hourglass, Truck, Ban,
  Users, CreditCard, Building2, HandCoins, Images, Bell, LayoutDashboard,
  Newspaper, MessageSquare, LineChart, Megaphone, Zap, History, User, LogOut,
  ChevronDown, Box, Cog, FileText,
} from "lucide-react";
import { ADMIN_NAV, hasPermission, type NavParent } from "@/lib/admin-nav-config";
import { cn } from "@/lib/utils";

// Maps the icon name strings in admin-nav-config.ts to actual lucide components.
// Kept centralized here so the config file stays plain data.
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Boxes, PlusSquare, Copyright, PackageOpen, Percent, FileSpreadsheet,
  StarHalf, Barcode, Tags, List, ListTree, Receipt, Hourglass,
  TruckElectric: Truck, Truck, Ban, Users, CreditCard, Building2, HandCoins,
  Images, Bell, LayoutDashboard, Newspaper, MessageSquare, LineChart,
  Megaphone, Zap, History, User, LogOut, Cog, FileText,
};

interface AdminSidebarProps {
  siteName: string;
  permissions: Record<string, Record<string, boolean>>;
  isOpen: boolean;
  onClose: () => void;
}

export function AdminSidebar(props: AdminSidebarProps) {
  // useSearchParams() requires a Suspense boundary during static export/build —
  // isolated here so the rest of the shell can render immediately.
  return (
    <Suspense fallback={null}>
      <AdminSidebarInner {...props} />
    </Suspense>
  );
}

function AdminSidebarInner({ siteName, permissions, isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inBlogSection = pathname?.startsWith("/admin/blog/") ?? false;

  // Tracks which submenus are expanded — defaults mirror the PHP behavior:
  // Products submenu open by default, Blog group open only if already inside /admin/blog/*,
  // Categories/Orders open if the current page belongs to that group.
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const defaults: Record<string, boolean> = {
      "submenu-products": true,
      "submenu-categories": pathname === "/admin/ecommerce/categories" || pathname === "/admin/ecommerce/subcategories",
      "submenu-orders": pathname?.startsWith("/admin/ecommerce/orders") ?? false,
      "submenu-blog": inBlogSection,
    };
    // Respect any saved user preference from a previous visit, like the original
    // localStorage-based persistence in sidebar-nav.php.
    const restored = { ...defaults };
    for (const id of Object.keys(defaults)) {
      try {
        const saved = window.localStorage.getItem(`nav_${id}`);
        if (saved !== null) restored[id] = saved === "1";
      } catch {
        /* localStorage unavailable — fall back to defaults */
      }
    }
    setOpenSubmenus(restored);
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

  function isActive(link: NavParent, isSubItem = false): boolean {
    if (link.matchQuery) {
      const [path] = link.href.split("?");
      return pathname === path && searchParams?.get(link.matchQuery.key) === link.matchQuery.value;
    }
    if (link.href === "/admin/ecommerce/orders" && !isSubItem) {
      return pathname === "/admin/ecommerce/orders" && !searchParams?.get("type");
    }
    return pathname === link.href;
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[999] lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 bottom-0 w-[280px] bg-white border-r border-admin-gray-200 z-[1000]",
          "flex flex-col overflow-y-auto transition-transform duration-300",
          "lg:sticky lg:h-screen lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar header */}
        <div className="p-6 border-b border-admin-gray-100 flex items-center justify-between">
          <Link href="/admin/dashboard" className="flex items-center gap-2.5 text-[1.15rem] font-extrabold text-admin-primary">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white bg-gradient-to-br from-admin-primary to-admin-primary-dark">
              <Box className="w-5 h-5" />
            </div>
            <span>{siteName}</span>
          </Link>
          <button
            className="w-9 h-9 bg-admin-gray-100 rounded-lg flex items-center justify-center text-admin-gray-600 hover:bg-admin-gray-200 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {ADMIN_NAV.map((section) => {
            if (!hasPermission(permissions, section.permission)) return null;

            // The Blog section renders as one collapsible group with the
            // section TITLE itself acting as the expand/collapse trigger —
            // every other section is a static title + flat/parented links.
            if (section.collapsibleGroup && section.submenuId) {
              const open = openSubmenus[section.submenuId] ?? inBlogSection;
              return (
                <div className="mb-6 px-4" key={section.title}>
                  <div className="flex items-center mb-1">
                    <div className="flex-1 text-[0.6875rem] font-bold uppercase tracking-widest text-admin-gray-400 pt-1.5">
                      {section.title}
                    </div>
                    <button
                      type="button"
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-admin-gray-400 hover:bg-admin-gray-50"
                      onClick={() => toggleSubmenu(section.submenuId!)}
                    >
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                  </div>
                  <div className={cn("overflow-hidden transition-all", open ? "max-h-[600px]" : "max-h-0")}>
                    {section.links.map((link) => {
                      if (!hasPermission(permissions, link.permission)) return null;
                      const Icon = ICONS[link.icon];
                      const active = isActive(link, true);
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={cn(
                            "flex items-center gap-3.5 pl-[1.1rem] pr-4 py-3.5 rounded-lg text-[0.9375rem] font-medium mb-1",
                            active ? "bg-admin-primary-lighter text-admin-primary font-semibold" : "text-admin-gray-600 hover:bg-admin-gray-50 hover:text-admin-gray-900"
                          )}
                        >
                          {Icon && <Icon className="w-[1.125rem] text-center" />}
                          {link.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div className="mb-6 px-4" key={section.title}>
                <div className="text-[0.6875rem] font-bold uppercase tracking-widest text-admin-gray-400 mb-3">
                  {section.title}
                </div>
                {section.links.map((link) => {
                  if (!hasPermission(permissions, link.permission)) return null;
                  const Icon = ICONS[link.icon];
                  const active = isActive(link);
                  const hasSubmenu = !!link.submenu?.length;
                  const submenuOpen = link.submenuId ? openSubmenus[link.submenuId] ?? link.defaultOpen : false;

                  return (
                    <div key={link.href}>
                      <div className="flex items-center mb-1">
                        <Link
                          href={link.href}
                          className={cn(
                            "flex-1 flex items-center gap-3.5 px-4 py-3.5 rounded-lg text-[0.9375rem] font-medium",
                            active ? "bg-admin-primary-lighter text-admin-primary font-semibold" : "text-admin-gray-600 hover:bg-admin-gray-50 hover:text-admin-gray-900"
                          )}
                        >
                          {Icon && <Icon className="w-[1.125rem] text-center" />}
                          {link.label}
                        </Link>
                        {hasSubmenu && (
                          <button
                            type="button"
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-admin-gray-400 hover:bg-admin-gray-50"
                            onClick={() => toggleSubmenu(link.submenuId!)}
                          >
                            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", submenuOpen && "rotate-180")} />
                          </button>
                        )}
                      </div>
                      {hasSubmenu && (
                        <div className={cn("overflow-hidden transition-all", submenuOpen ? "max-h-[600px]" : "max-h-0")}>
                          {link.submenu!.map((sub) => {
                            if (!hasPermission(permissions, sub.permission)) return null;
                            const SubIcon = ICONS[sub.icon];
                            const subActive = isActive(sub, true);
                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                className={cn(
                                  "flex items-center gap-3.5 pl-[2.75rem] pr-4 py-3.5 rounded-lg text-sm mb-1",
                                  subActive ? "bg-admin-primary-lighter text-admin-primary font-semibold" : "text-admin-gray-600 hover:bg-admin-gray-50 hover:text-admin-gray-900"
                                )}
                              >
                                {SubIcon && <SubIcon className="w-[1.125rem] text-center" />}
                                {sub.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
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
