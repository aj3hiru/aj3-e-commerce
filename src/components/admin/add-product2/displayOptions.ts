import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/add-product2. Only optional fields can
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
      { key: "ap2-barcode", label: "Barcode" },
      { key: "ap2-desc", label: "Description" },
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
    group: "ap2-price",
    groupLabel: "Pricing & Stock",
    items: [
      { key: "ap2-sale", label: "Sale Price" },
      { key: "ap2-stock", label: "Stock Quantity" },
      { key: "ap2-gst", label: "GST Rate" },
    ],
  },
  {
    group: "ap2-more",
    groupLabel: "Sizes & Specifications",
    items: [
      { key: "ap2-sizes", label: "Sizes / Units" },
      { key: "ap2-specs", label: "Specifications" },
    ],
  },
  {
    group: "ap2-media",
    groupLabel: "Images",
    items: [
      { key: "ap2-image", label: "Product Image" },
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
];

export const ADD2_STANDALONE: readonly { key: string; label: string }[] = [];
