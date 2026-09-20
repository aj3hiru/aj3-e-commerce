import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/add-product2. Only optional things can
 * be hidden — Product Name and Price are always shown. Hiding a field only
 * hides it: when editing, its saved value is kept and saved back unchanged.
 */
export const ADD2_PREF_KEY = "ecom_add_product2_display";

export const ADD2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "ap2-basic",
    groupLabel: "Basic Info",
    items: [
      { key: "ap2-slug", label: "Slug" },
      { key: "ap2-sku", label: "SKU" },
      { key: "ap2-hsn", label: "HSN Code" },
      { key: "ap2-barcode", label: "Barcode / QR Code" },
      { key: "ap2-desc", label: "Description" },
    ],
  },
  {
    group: "ap2-price",
    groupLabel: "Pricing & Stock",
    items: [
      { key: "ap2-sale", label: "Sale Price" },
      { key: "ap2-stock", label: "Stock Quantity" },
      { key: "ap2-gst", label: "GST Rate" },
    ],
  },
  {
    group: "ap2-cat",
    groupLabel: "Categorization",
    items: [
      { key: "ap2-category", label: "Category" },
      { key: "ap2-subcategory", label: "Sub Category" },
      { key: "ap2-brand", label: "Brand" },
      { key: "ap2-unit", label: "Unit" },
    ],
  },
  {
    group: "ap2-sizes",
    groupLabel: "Sizes / Units",
    items: [
      { key: "ap2-sz-default", label: "Default size" },
      { key: "ap2-sz-price", label: "Selling Price" },
      { key: "ap2-sz-stock", label: "Stock" },
      { key: "ap2-sz-help", label: "Help text" },
    ],
  },
  {
    group: "ap2-specs",
    groupLabel: "Specifications",
    items: [{ key: "ap2-sp-help", label: "Help text" }],
  },
  {
    group: "ap2-media",
    groupLabel: "Product Images",
    items: [
      { key: "ap2-image", label: "Featured Image" },
      { key: "ap2-gallery", label: "Gallery" },
    ],
  },
  {
    group: "ap2-org",
    groupLabel: "Organization",
    items: [
      { key: "ap2-status", label: "Status" },
      { key: "ap2-badge", label: "Badge Tag" },
      { key: "ap2-itemtype", label: "Item Type" },
      { key: "ap2-home", label: "Show on Home" },
      { key: "ap2-campaign", label: "Campaign" },
    ],
  },
  {
    group: "ap2-quick",
    groupLabel: "“+ Add new” options",
    items: [
      { key: "ap2-q-category", label: "Add new Category" },
      { key: "ap2-q-subcategory", label: "Add new Sub Category" },
      { key: "ap2-q-brand", label: "Add new Brand" },
      { key: "ap2-q-itemtype", label: "Add new Item Type" },
    ],
  },
];

export const ADD2_STANDALONE: readonly { key: string; label: string }[] = [];
