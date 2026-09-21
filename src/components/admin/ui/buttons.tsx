"use client";

import Link from "next/link";
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StatusDropdown, STATUS_BTN_STYLES, type StatusVariant } from "@/components/admin/StatusDropdown";

/**
 * The admin's one set of buttons and dropdowns.
 *
 * Everything here copies the look of the Orders page (/admin/ecommerce/orders)
 * — its status pills, its dropdown list and its eye / delete buttons — so a
 * button means the same thing wherever it appears. Nothing here invents new
 * CSS: the pill and the dropdown come from the site's own StatusDropdown.
 *
 *   StatusPill    a coloured pill with a caret; click it and pick a value
 *   StatusBadge   the same pill with no caret, for a status you can't change
 *   PillButton    the same shape as a plain button (Add, Collect, …)
 *   IconAction    the 34px square icon buttons (view / edit / delete / print)
 *   ActionMenu    a button that opens the same white list (Bulk Actions, Export)
 */

export type PillVariant = StatusVariant | "primary";

/** The Orders page palette, plus the blue its Edit buttons use. */
const PILL_STYLES: Record<PillVariant, { background: string; color: string }> = {
  ...STATUS_BTN_STYLES,
  primary: { background: "#4e73df", color: "#fff" },
};

/** `.btn.btn-sm` with the `.status-btn` overrides: square, flat, 500 weight. */
export const PILL_CLASS =
  "inline-flex items-center gap-1.5 whitespace-nowrap border-0 rounded-none shadow-none px-2 py-1 text-sm font-medium leading-normal disabled:opacity-65";

/** Bootstrap's `.dropdown-toggle::after`: a 0.3em solid triangle. */
export function Caret() {
  return (
    <span
      aria-hidden
      className="inline-block align-[0.15em]"
      style={{ width: 0, height: 0, borderLeft: "0.3em solid transparent", borderRight: "0.3em solid transparent", borderTop: "0.3em solid currentColor" }}
    />
  );
}

/* ───────────────────────── status pill ───────────────────────── */

export interface PillOption<V extends string> {
  value: V;
  /** The word shown on the pill and in the list. */
  label: string;
  variant: StatusVariant;
}

/**
 * A status you can change: the pill shows the current value's word and colour,
 * and its list offers every option. Uses the site's StatusDropdown, so it
 * behaves exactly like the Orders page (portalled list that can't be clipped
 * by a table, closes on outside click, Escape and scroll).
 */
export function StatusPill<V extends string>({ value, options, onChange, disabled, label }: {
  value: V;
  options: readonly PillOption<V>[];
  onChange: (next: V) => void;
  disabled?: boolean;
  /** Accessible name, e.g. "Change status of Maggie". */
  label: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <StatusDropdown
      label={label}
      value={current?.label ?? String(value)}
      options={options.map((o) => o.label)}
      variant={current?.variant ?? "secondary"}
      disabled={disabled}
      onSelect={(word) => {
        const next = options.find((o) => o.label === word);
        if (next) onChange(next.value);
      }}
    />
  );
}

/** The pill with no caret and no click — for a status shown but not editable. */
export function StatusBadge({ variant, children, title }: { variant: PillVariant; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={PILL_CLASS} style={{ backgroundColor: PILL_STYLES[variant].background, color: PILL_STYLES[variant].color }}>
      {children}
    </span>
  );
}

/* ───────────────────────── pill-shaped button ───────────────────────── */

type PillButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: PillVariant;
  /** Show the dropdown caret (for a button that opens a list or panel). */
  caret?: boolean;
};

/** A plain button in the same shape and colours as a status pill. */
export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  { variant = "primary", caret, className, style, type = "button", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={className ? `${PILL_CLASS} ${className}` : PILL_CLASS}
      style={{ backgroundColor: PILL_STYLES[variant].background, color: PILL_STYLES[variant].color, ...style }}
      {...rest}
    >
      {children}
      {caret && <Caret />}
    </button>
  );
});

/* ───────────────────────── icon buttons ───────────────────────── */

export type IconTone = "view" | "print" | "edit" | "delete" | "add" | "warn";

const ICON_STYLES: Record<IconTone, { background: string; color: string }> = {
  view: { background: "#858796", color: "#fff" }, // the grey eye on the Orders page
  print: { background: "#858796", color: "#fff" },
  edit: { background: "#4e73df", color: "#fff" },
  delete: { background: "#ef4444", color: "#fff" }, // the red bin on the Orders page
  add: { background: "#1cc88a", color: "#fff" }, // the green of an Active / Paid pill
  warn: { background: "#f6c23e", color: "#1f2937" }, // the amber of a Pending pill
};

const ICON_CLASS =
  "inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded p-0 text-white transition-opacity hover:opacity-85 disabled:opacity-50 [&>svg]:h-3.5 [&>svg]:w-3.5";

type IconActionProps = {
  tone: IconTone;
  /** Shown as the tooltip and used as the accessible name. */
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
} & ({ href: string; target?: string; rel?: string; onClick?: undefined } | { href?: undefined; target?: undefined; rel?: undefined; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void });

/** The square icon button: a link when given `href`, otherwise a button. */
export function IconAction({ tone, title, children, disabled, href, target, rel, onClick }: IconActionProps) {
  const style = { backgroundColor: ICON_STYLES[tone].background, color: ICON_STYLES[tone].color };
  if (href !== undefined) {
    return (
      <Link href={href} target={target} rel={rel} title={title} aria-label={title} className={ICON_CLASS} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className={ICON_CLASS} style={style}>
      {children}
    </button>
  );
}

/* ───────────────────────── dropdown menu ───────────────────────── */

export interface MenuItem {
  label: string;
  onClick: () => void;
  /** Small grey text at the right of the row (e.g. "CSV"). */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A button that opens the same white list the status pill opens: sharp
 * corners, hairline border, rows that turn light grey on hover. The list is
 * portalled and fixed, so a table's scroll box can never clip it.
 *
 * By default the trigger is a pill (`variant`, with a caret). Pass `bare` and
 * `triggerClassName` to keep an existing header-style button as the trigger.
 */
export function ActionMenu({ label, trigger, items, variant = "secondary", disabled, align = "left", bare, triggerClassName, title }: {
  /** Accessible name of the trigger. */
  label: string;
  trigger: React.ReactNode;
  items: MenuItem[];
  variant?: PillVariant;
  disabled?: boolean;
  align?: "left" | "right";
  bare?: boolean;
  triggerClassName?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = menu.current?.offsetHeight ?? 160;
    const w = menu.current?.offsetWidth ?? 160;
    const openUp = r.bottom + h > window.innerHeight && r.top > h;
    const left = align === "right" ? Math.max(8, r.right - w) : Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    setPos({ top: openUp ? r.top - h - 2 : r.bottom + 2, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || menu.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const common = {
    "aria-label": label,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    disabled,
    title,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen((o) => !o);
    },
  };

  return (
    <>
      {bare ? (
        <button ref={btn} type="button" className={triggerClassName} {...common}>
          {trigger}
        </button>
      ) : (
        <PillButton ref={btn} variant={variant} caret className={triggerClassName} {...common}>
          {trigger}
        </PillButton>
      )}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            className="fixed z-50 min-w-[10rem] rounded-none border border-black/[0.175] bg-white py-2 text-sm shadow-lg"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                type="button"
                disabled={it.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
                className={
                  "flex w-full items-center justify-between gap-6 whitespace-nowrap px-4 py-1 text-left font-normal disabled:cursor-not-allowed disabled:text-[#adb5bd] disabled:hover:bg-transparent " +
                  (it.danger ? "text-[#dc3545] hover:bg-[#e9ecef]" : "text-[#212529] hover:bg-[#e9ecef]")
                }
              >
                {it.label}
                {it.hint && <span className="text-xs text-[#6c757d]">{it.hint}</span>}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
