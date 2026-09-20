import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/**
 * Display Options for /admin/ecommerce/campaign-offer2 — same panel and store
 * as the other "2" pages, with its own localStorage key so hiding something
 * here never hides anything on another page.
 */
export const CAMPAIGNS2_PREF_KEY = "ecom_campaign_offer2_display";

export const CAMPAIGNS2_GROUPS: readonly WidgetGroup[] = [
  {
    group: "co2-metrics",
    groupLabel: "Key Metrics",
    items: [
      { key: "co2-m-live", label: "Active Campaigns" },
      { key: "co2-m-products", label: "Products on Offer" },
      { key: "co2-m-sales", label: "Campaign Sales" },
      { key: "co2-m-units", label: "Units Sold" },
      { key: "co2-m-discount", label: "Discount Given" },
      { key: "co2-m-orders", label: "Orders with Offer" },
    ],
  },
  {
    group: "co2-campaigns",
    groupLabel: "Campaigns & History",
    items: [
      { key: "co2-c-applies", label: "Applies To" },
      { key: "co2-c-offer", label: "Offer" },
      { key: "co2-c-schedule", label: "Schedule" },
      { key: "co2-c-status", label: "Status" },
      { key: "co2-c-sales", label: "Sales" },
      { key: "co2-c-actions", label: "Actions" },
      { key: "co2-c-search", label: "Search box" },
    ],
  },
  {
    group: "co2-offers",
    groupLabel: "Products on Offer",
    items: [
      { key: "co2-p-image", label: "Image" },
      { key: "co2-p-price", label: "Price" },
      { key: "co2-p-campaign", label: "Campaign" },
      { key: "co2-p-ends", label: "Ends" },
      { key: "co2-p-actions", label: "Actions" },
      { key: "co2-p-search", label: "Search box" },
    ],
  },
];

export const CAMPAIGNS2_STANDALONE: readonly { key: string; label: string }[] = [
  { key: "co2-range", label: "Date Range Bar" },
  { key: "co2-chart", label: "Campaign Sales Graph" },
];
