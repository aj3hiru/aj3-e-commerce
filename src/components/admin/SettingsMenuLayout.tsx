"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Optional one-line hint shown under the panel heading. */
  hint?: string;
}

interface SettingsMenuLayoutProps {
  items: SettingsMenuItem[];
  active: string;
  onSelect: (key: string) => void;
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="lg:sticky lg:top-[72px] lg:self-start">
        <div className="overflow-hidden rounded-card border border-card bg-white shadow-card p-2">
          {items.map((item) => {
            const isActive = item.key === active;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "mb-0.5 flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-[0.875rem] transition-colors",
                  isActive
                    ? "bg-admin-primary-lighter font-semibold text-admin-primary"
                    : "font-medium text-admin-gray-600 hover:bg-admin-gray-50 hover:text-admin-gray-900"
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-admin-primary" : "text-admin-gray-400")} />
                <span className="flex-1">{item.label}</span>
                {isActive && <ChevronRight className="h-4 w-4 shrink-0" />}
              </button>
            );
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
    <section className="rounded-card border border-card bg-white shadow-card px-6 py-5">
      {/* business-settings.php: <h5 class="mb-3"><i class="fas … text-primary"></i> Title</h5> */}
      <h5 className="flex items-center gap-2 text-[1rem] font-semibold text-admin-gray-800">
        <Icon className="h-4 w-4 text-admin-primary" />
        {title}
      </h5>
      {/* .settings-section-hint */}
      {hint ? (
        <p className="mb-4 mt-1 text-[0.8rem] text-admin-gray-400">{hint}</p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}

/** `.gd-card .form-label` — 0.825rem / 600 / var(--gray-600). */
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
      <label htmlFor={htmlFor} className="mb-[0.35rem] block text-[0.825rem] font-semibold text-admin-gray-600">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[0.75rem] text-admin-gray-400">{hint}</p>}
    </div>
  );
}

/** Shared input styling so every control on the page matches `.form-control`. */
export const CONTROL_CLASS =
  "w-full rounded border border-admin-gray-200 px-3 py-2 text-sm text-admin-gray-800 focus:border-admin-primary focus:outline-none";

/**
 * A checkbox row rendered as a tinted block, matching the two-column checkbox
 * grid in the reference screenshot.
 */
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
        "flex cursor-pointer select-none items-center gap-2.5 rounded-md border px-3 py-2.5 text-[0.875rem] transition-colors",
        checked
          ? "border-admin-primary-light bg-admin-primary-lighter text-admin-gray-800"
          : "border-admin-gray-200 bg-white text-admin-gray-600 hover:bg-admin-gray-50"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[15px] w-[15px] cursor-pointer accent-admin-primary"
      />
      {children}
    </label>
  );
}
