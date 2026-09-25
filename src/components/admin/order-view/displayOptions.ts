import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Display Options for one order's page (/admin/ecommerce/orders/[id]); own localStorage key. */
export const ORDERVIEW_PREF_KEY = "ecom_order_view_display";

export const ORDERVIEW_GROUPS: readonly WidgetGroup[] = [
  {
    group: "ov-header",
    groupLabel: "Order Header",
    items: [
      { key: "ov-h-date", label: "Date & time" },
      { key: "ov-h-type", label: "Online / store bill" },
      { key: "ov-h-total", label: "Order total" },
      { key: "ov-h-pills", label: "Status & payment pills" },
      { key: "ov-h-print", label: "Print buttons (A4 / Thermal)" },
      { key: "ov-h-contact", label: "Call / WhatsApp buttons" },
    ],
  },
  {
    group: "ov-items",
    groupLabel: "Items Table",
    items: [
      { key: "ov-c-num", label: "#" },
      { key: "ov-c-image", label: "Product photo" },
      { key: "ov-c-product", label: "Product" },
      { key: "ov-c-qty", label: "Quantity" },
      { key: "ov-c-price", label: "Price" },
      { key: "ov-c-gst", label: "GST %" },
      { key: "ov-c-subtotal", label: "Amount" },
      { key: "ov-c-remove", label: "Remove button" },
      { key: "ov-i-add", label: "Add a product" },
    ],
  },
  {
    group: "ov-bill",
    groupLabel: "Bill Summary",
    items: [
      { key: "ov-b-subtotal", label: "Subtotal" },
      { key: "ov-b-discount", label: "Discount" },
      { key: "ov-b-gst", label: "GST" },
      { key: "ov-b-paid", label: "Paid" },
      { key: "ov-b-due", label: "Due" },
    ],
  },
  {
    group: "ov-side",
    groupLabel: "Right Side Cards",
    items: [
      { key: "ov-s-actions", label: "Actions (accept, agent, payment…)" },
      { key: "ov-s-customer", label: "Customer" },
      { key: "ov-s-address", label: "Delivery address" },
      { key: "ov-s-map", label: "Map of the delivery spot" },
      { key: "ov-s-payment", label: "Payment details" },
    ],
  },
];

export const ORDERVIEW_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "ov-progress", label: "Progress bar (Placed → Delivered)" },
  { key: "ov-history", label: "Order history" },
];
