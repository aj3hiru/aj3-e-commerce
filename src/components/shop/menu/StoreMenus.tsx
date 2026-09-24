"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown, ChevronRight, CircleHelp, FileText, Gift, Grid2x2, Heart, House, Info, Link2, Mail, MapPin, Package, Percent, Phone,
  ShoppingCart, Star, Store, Tag, Truck, User, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MenuDesign, MenuIcon, MenuItem } from "@/types/storefront";
import type { ShopCategoryNavItem } from "@/types/shop";

export const MENU_ICON: Record<MenuIcon, LucideIcon> = {
  home: House, grid: Grid2x2, cart: ShoppingCart, heart: Heart, user: User, package: Package, truck: Truck, tag: Tag,
  percent: Percent, gift: Gift, star: Star, store: Store, phone: Phone, mail: Mail, map: MapPin, info: Info,
  help: CircleHelp, file: FileText, link: Link2,
};

export interface ResolvedItem extends Omit<MenuItem, "children"> { children: { id: string; label: string; href: string }[] }

/** Menu items this visitor should see, with "All Categories" dropdowns filled in. */
export function resolveMenu(items: MenuItem[], loggedIn: boolean, categories: ShopCategoryNavItem[]): ResolvedItem[] {
  return items
    .filter((i) => i.enabled && (i.visibility === "all" || (i.visibility === "user") === loggedIn))
    .map((i) => ({
      ...i,
      children: i.autoCategories
        ? [...categories.map((c) => ({ id: `cat-${c.slug}`, label: c.name, href: `/shop/category?slug=${encodeURIComponent(c.slug)}` })),
           ...i.children]
        : i.children,
    }));
}

const linkProps = (href: string, newTab: boolean) =>
  newTab || /^https?:/i.test(href) ? { target: newTab ? "_blank" : undefined, rel: "noopener noreferrer" } : {};

/* ───────────────────────── desktop header menu ───────────────────────── */

/** Horizontal menu under the desktop header; items with children open a
 *  dropdown on hover or keyboard focus. */
export function DesktopMenu({ items, design, isActive }: { items: ResolvedItem[]; design: MenuDesign; isActive: (href: string) => boolean }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Main menu" className="hidden shop:block border-b border-storefront-border bg-white" style={{ ["--menu-accent" as string]: design.accent }}>
      <ul className="flex flex-wrap items-center gap-1 px-6 text-sm font-semibold">
        {items.map((it) => {
          const Icon = MENU_ICON[it.icon];
          const active = isActive(it.href);
          return (
            <li key={it.id} className="group relative">
              <Link href={it.href} {...linkProps(it.href, it.newTab)}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-3 text-[#333] transition-colors hover:text-[var(--menu-accent)]",
                  active && "text-[var(--menu-accent)]")}
                aria-haspopup={it.children.length ? "true" : undefined}>
                {design.showIcons && <Icon className="h-4 w-4" strokeWidth={2} />}
                {it.label}
                {it.children.length > 0 && <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />}
              </Link>
              {active && <span className="absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-[var(--menu-accent)]" aria-hidden />}
              {it.children.length > 0 && (
                <div className="invisible absolute left-0 top-full z-40 min-w-[220px] translate-y-1 opacity-0 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                  <ul className="mt-0.5 max-h-[60vh] overflow-y-auto rounded-lg border border-storefront-border bg-white py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                    {it.children.map((c) => (
                      <li key={c.id}>
                        <Link href={c.href} {...linkProps(c.href, false)}
                          className={cn("block px-4 py-2 text-[13.5px] font-medium text-[#333] hover:bg-[color-mix(in_srgb,var(--menu-accent)_10%,white)] hover:text-[var(--menu-accent)]",
                            design.dividers && "border-b border-storefront-border/70 last:border-b-0")}>
                          {c.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ───────────────────────── mobile sidebar menu ───────────────────────── */

/**
 * The sidebar list, modelled on the reference drawer: full-width rows with
 * dividers, and items with children opening an in-place dropdown whose arrow
 * turns as it slides open — in the store's own colours.
 */
export function SidebarMenu({ items, design, isActive, onNavigate }: {
  items: ResolvedItem[]; design: MenuDesign; isActive: (href: string) => boolean; onNavigate?: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // Meesho-style rows: grey outline icon, dark label, light chevron, hairline dividers;
  // the current page gets the accent colour and a bar on the left.
  return (
    <ul className="w-full" style={{ ["--menu-accent" as string]: design.accent }}>
      {items.map((it) => {
        const Icon = MENU_ICON[it.icon];
        const active = isActive(it.href);
        const expanded = open === it.id;
        const row = cn("relative flex min-h-[50px] w-full items-center gap-3.5 px-4 text-left text-[15px] transition-colors active:bg-[#f8f9fe]",
          active ? "font-semibold text-[var(--menu-accent)]" : "text-[#353543]");
        const bar = active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[var(--menu-accent)]" />;
        const icon = design.showIcons && <Icon className={cn("h-5 w-5 shrink-0", active || expanded ? "text-[var(--menu-accent)]" : "text-[#666]")} strokeWidth={1.7} />;
        return (
          <li key={it.id} className={cn(design.dividers && "border-b border-[#eaeaf2]")}>
            {it.children.length > 0 ? (
              <>
                <button type="button" onClick={() => setOpen((o) => (o === it.id ? null : it.id))} aria-expanded={expanded} className={cn(row, expanded && "bg-[#f8f9fe]")}>
                  {bar}{icon}
                  <span className="flex-1">{it.label}</span>
                  <ChevronDown className={cn("h-[18px] w-[18px] text-[#a7a9b6] transition-transform duration-200", expanded && "rotate-180 text-[var(--menu-accent)]")} strokeWidth={2} />
                </button>
                <Accordion open={expanded}>
                  <ul className="bg-[#f8f9fe] pb-1.5">
                    {it.children.map((c) => (
                      <li key={c.id}>
                        <Link href={c.href} onClick={onNavigate} {...linkProps(c.href, false)}
                          className={cn("flex min-h-[42px] items-center justify-between gap-2 pr-4 text-[14px]", design.showIcons ? "pl-[52px]" : "pl-7",
                            isActive(c.href) ? "font-semibold text-[var(--menu-accent)]" : "text-[#616173]")}>
                          <span className="min-w-0 truncate">{c.label}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[#c4c5d0]" strokeWidth={2} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Accordion>
              </>
            ) : (
              <Link href={it.href} onClick={onNavigate} {...linkProps(it.href, it.newTab)} className={row}>
                {bar}{icon}
                <span className="flex-1">{it.label}</span>
                <ChevronRight className="h-[18px] w-[18px] text-[#a7a9b6]" strokeWidth={2} />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Height-animated collapse (like the reference's max-height transition, but
 *  measured, so long category lists open fully). */
function Accordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => { if (open && inner.current) setH(inner.current.scrollHeight); }, [open, children]);
  return (
    <div style={{ maxHeight: open ? h : 0 }} className={cn("overflow-hidden transition-[max-height,opacity] duration-200 ease-out", open ? "opacity-100" : "opacity-0")} aria-hidden={!open}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
