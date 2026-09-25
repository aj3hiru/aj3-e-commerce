"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Optional one-line hint shown under the panel heading. */
  hint?: string;
  /** A section that is its own page (Payment Methods, GST…): the item navigates. */
  href?: string;
}

interface SettingsMenuLayoutProps {
  items: SettingsMenuItem[];
  active: string;
  onSelect?: (key: string) => void;
  children: React.ReactNode;
}

/**
 * The two-pane settings shell: a vertical menu on the left, one panel on the
 * right — the WordPress-customizer arrangement the store owner asked for, in
 * place of the horizontal `.settings-tabs` row business-settings.php used.
 *
 * Colours and metrics come from the admin's own tokens so it sits in the same
 * design language as the rest of the panel: `.nav-link`-style rows (0.875rem
 * 500 var(--gray-600), active = var(--primary-lighter) bg + var(--primary)
 * text + 600), inside a `.gd-card` surface.
 *
 * The menu is a real <nav> of buttons with aria-current rather than links,
 * because switching panels must not navigate — an in-progress edit in another
 * panel has to survive the switch, since one Save button submits them all.
 */
export function SettingsMenuLayout({ items, active, onSelect, children }: SettingsMenuLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-4 font-storefront text-[#353543] lg:grid-cols-[250px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="lg:sticky lg:top-[72px] lg:self-start">
        {/* Phones: a scrollable chip row; computers: a side menu (Meesho style). */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:mx-0 lg:block lg:overflow-visible lg:rounded-2xl lg:bg-white lg:p-2 lg:shadow-sm lg:ring-1 lg:ring-[#eaeaf2]">
          {items.map((item) => {
            const isActive = item.key === active;
            const Icon = item.icon;
            const cls = cn(
                  "relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-full border px-3.5 py-2 text-left text-[14px] transition-colors lg:mb-0.5 lg:w-full lg:rounded-[8px] lg:border-0 lg:py-2.5",
                  isActive
                    ? "border-[#9f2089] bg-[#fdf0f9] font-semibold text-[#9f2089]"
                    : "border-[#dcdce6] bg-white font-medium text-[#616173] hover:bg-[#f8f9fe] hover:text-[#353543]"
                );
            const inner = (
              <>
                {isActive && <span aria-hidden className="absolute inset-y-2 left-0 hidden w-[3px] rounded-r bg-[#9f2089] lg:block" />}
                <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-[#9f2089]" : "text-[#8b8ba3]")} strokeWidth={1.8} />
                <span className="flex-1">{item.label}</span>
                {isActive && <ChevronRight className="hidden h-4 w-4 shrink-0 lg:block" />}
              </>
            );
            return item.href && !isActive
              ? <Link key={item.key} href={item.href} className={cls}>{inner}</Link>
              : <button key={item.key} type="button" onClick={() => onSelect?.(item.key)} aria-current={isActive ? "true" : undefined} className={cls}>{inner}</button>;
          })}
        </div>
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** One panel on the right-hand side: heading, optional hint, then fields. */
export function SettingsPanel({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white px-5 py-5 font-storefront text-[#353543] shadow-sm ring-1 ring-[#eaeaf2] sm:px-6">
      <div className="mb-4 flex items-start gap-3 border-b border-[#f0f0f5] pb-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fdf0f9] text-[#9f2089]"><Icon className="h-5 w-5" strokeWidth={1.9} /></span>
        <div className="min-w-0">
          <h5 className="text-[17px] font-semibold leading-6">{title}</h5>
          {hint && <p className="mt-0.5 text-[13px] leading-5 text-[#8b8ba3]">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** A labelled field. */
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-[#616173]">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[12px] leading-4 text-[#8b8ba3]">{hint}</p>}
    </div>
  );
}

/** Shared input styling (Meesho: 4px corners, soft border, store-colour focus). */
export const CONTROL_CLASS =
  "w-full min-h-[44px] rounded-[4px] border border-[#cfcedc] bg-white px-3 py-2 text-[15px] text-[#353543] outline-none transition placeholder:text-[#a7a9b6] focus:border-[#9f2089] focus:ring-2 focus:ring-[#9f2089]/15 disabled:bg-[#f5f5f8]";

/** A checkbox as a tappable card. */
export function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-[8px] border px-3 py-2.5 text-[14px] transition-colors",
        checked
          ? "border-[#9f2089] bg-[#fdf0f9] text-[#353543]"
          : "border-[#dcdce6] bg-white text-[#616173] hover:bg-[#f8f9fe]"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[18px] w-[18px] cursor-pointer accent-[#9f2089]"
      />
      {children}
    </label>
  );
}
