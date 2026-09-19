"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The order-status / payment-status pill-with-dropdown used in the orders list
 * and on the dashboard's Recent Orders table.
 *
 * Styling is a direct port of the `.status-btn` rules in
 * admin/ecommerce/components/ecom-head.php plus Bootstrap's `.btn.btn-sm`,
 * `.dropdown-toggle::after` and `.dropdown-menu` defaults:
 *
 *   .status-btn            { border:none; border-radius:0; box-shadow:none; font-weight:500 }
 *   .btn-sm                { padding:.25rem .5rem; font-size:.875rem }
 *   .dropdown-toggle::after{ a 0.3em CSS caret, vertical-align:.15em }
 *   .dropdown-menu         { border-radius:0 (overridden); 1px solid rgba(0,0,0,.175);
 *                            padding:.5rem 0; min-width:10rem }
 *   .dropdown-item         { padding:.25rem 1rem; color:#212529; hover bg #e9ecef }
 *
 * The square corners are deliberate — `border-radius: 0` is an explicit
 * override of Bootstrap's rounded buttons, so rounding these would be a visible
 * departure from the original admin.
 */

/** `.status-btn.*` background/foreground pairs, verbatim from ecom-head.php,
 *  plus `.status-info-btn` which orders.php defines in its own <style> block. */
export const STATUS_BTN_STYLES = {
  success: { background: "#1cc88a", color: "#fff" },        // .status-btn.btn-success
  secondary: { background: "#858796", color: "#fff" },      // .btn-secondary-status
  warning: { background: "#f6c23e", color: "#1f2937" },     // .btn-warning-status
  danger: { background: "#ef4444", color: "#fff" },         // .btn-danger-status (var(--danger))
  info: { background: "#3b82f6", color: "#fff" },           // .status-info-btn (var(--info))
} as const;

export type StatusVariant = keyof typeof STATUS_BTN_STYLES;

// Re-exported so table components can pull the pill component and its option
// lists from one import; the values themselves live in a server-safe module.
export { ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/order-statuses";
export type { OrderStatus, PaymentStatus } from "@/lib/order-statuses";

/** $osClasses in orders.php, extended with the new status. */
export const ORDER_STATUS_VARIANTS: Record<string, StatusVariant> = {
  Pending: "warning",
  "In Progress": "info",
  "Out for Delivery": "info",
  Delivered: "success",
  Canceled: "danger",
};

export function orderStatusVariant(status: string): StatusVariant {
  return ORDER_STATUS_VARIANTS[status] ?? "secondary";
}

/** payment_status === 'Paid' ? btn-success : btn-secondary-status */
export function paymentStatusVariant(status: string): StatusVariant {
  return status === "Paid" ? "success" : "secondary";
}

interface StatusDropdownProps {
  value: string;
  options: readonly string[];
  variant: StatusVariant;
  disabled?: boolean;
  onSelect: (next: string) => void;
  /** Accessible name, e.g. "Change order status for ORD-0012". */
  label: string;
}

export function StatusDropdown({ value, options, variant, disabled, onSelect, label }: StatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const style = STATUS_BTN_STYLES[variant];

  // Bootstrap closes an open dropdown on any outside click; mirror that.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        // .btn.btn-sm sizing + .status-btn overrides (square, no shadow, 500 weight)
        className="inline-flex items-center gap-1.5 whitespace-nowrap border-0 rounded-none shadow-none px-2 py-1 text-sm font-medium leading-normal disabled:opacity-65"
        style={{ backgroundColor: style.background, color: style.color }}
      >
        {value}
        {/* Bootstrap's .dropdown-toggle::after caret: a 0.3em solid triangle */}
        <span
          aria-hidden
          className="inline-block align-[0.15em]"
          style={{
            width: 0,
            height: 0,
            borderLeft: "0.3em solid transparent",
            borderRight: "0.3em solid transparent",
            borderTop: "0.3em solid currentColor",
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          // .dropdown-menu, with the ecom-head.php `border-radius: 0` override
          className="absolute left-0 top-full z-30 mt-0.5 min-w-[10rem] rounded-none border border-black/[0.175] bg-white py-2 text-sm"
        >
          {options.map((opt) => (
            <button
              key={opt}
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                if (opt !== value) onSelect(opt);
              }}
              // .dropdown-item
              className="block w-full whitespace-nowrap px-4 py-1 text-left font-normal text-[#212529] hover:bg-[#e9ecef]"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
