import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/billing2 — same panel and store as
 * /admin/dashboard2, with its own localStorage key so hiding something here
 * never hides a dashboard card (visibility is stored by key name).
 *
 * A group's checkbox shows/hides that whole section; the items inside it
 * show/hide individual parts (for the cart, its table columns).
 * "Pay Now" is deliberately not listed: a billing screen must always be able
 * to complete a sale.
 */
export const BILLING2_PREF_KEY = "ecom_billing2_display";

export const BILLING2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "b2-cart",
    groupLabel: "Cart",
    items: [
      { key: "b2-col-product", label: "Product" },
      { key: "b2-col-price", label: "Price" },
      { key: "b2-col-qty", label: "Quantity" },
      { key: "b2-col-unit", label: "Unit" },
      { key: "b2-col-subtotal", label: "Subtotal" },
      { key: "b2-col-action", label: "Action" },
    ],
  },
  {
    group: "b2-footer",
    groupLabel: "Coupon & Totals",
    items: [
      { key: "b2-coupon", label: "Coupon Code" },
      { key: "b2-totals", label: "Subtotal / GST / Total" },
    ],
  },
  {
    group: "b2-summary",
    groupLabel: "Payment Summary",
    items: [
      { key: "b2-sum-total", label: "Total Amount" },
      { key: "b2-sum-received", label: "Amount Received" },
      { key: "b2-sum-due", label: "Due / Fully Paid" },
    ],
  },
  {
    group: "b2-checkout",
    groupLabel: "Customer & Payment",
    items: [
      { key: "b2-customer", label: "Customer" },
      { key: "b2-payments", label: "Payment Methods" },
      { key: "b2-secure-note", label: "Secure Payment Note" },
    ],
  },
];

export const BILLING2_STANDALONE = [
  { key: "b2-scan", label: "Scan / Search Bar" },
  { key: "b2-add-product", label: "Add Product Button" },
] as const;
