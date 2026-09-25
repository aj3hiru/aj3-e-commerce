import type { WidgetGroup } from "@/hooks/useDashboardWidgetPrefs";

/** Report Builder — Display Options: every section and every column can be shown or hidden. */
export const RB_PREF_KEY = "ecom_report_builder_display";

export const RB_GROUPS: readonly WidgetGroup[] = [
  {
    group: "rb-filters", groupLabel: "Filters",
    items: [
      { key: "rb-f-presets", label: "Today / Yesterday / This & Previous Month" },
      { key: "rb-f-month", label: "Month picker (January, February…)" },
      { key: "rb-f-range", label: "Date range & Custom Range" },
      { key: "rb-f-channel", label: "All Sales / In-store / Online" },
      { key: "rb-f-staff", label: "Staff (report for one person)" },
    ],
  },
  {
    group: "rb-head", groupLabel: "Report Header",
    items: [
      { key: "rb-h-logo", label: "Logo" },
      { key: "rb-h-name", label: "Business name & tagline" },
      { key: "rb-h-address", label: "Address" },
      { key: "rb-h-contact", label: "Mobile & email" },
      { key: "rb-h-gstin", label: "GSTIN" },
      { key: "rb-h-generated", label: "Generated on" },
    ],
  },
  {
    group: "rb-kpi", groupLabel: "Summary Cards",
    items: [
      { key: "rb-k-sales", label: "Total Sales" },
      { key: "rb-k-units", label: "Total Products Sold" },
      { key: "rb-k-due", label: "Total Dues" },
      { key: "rb-k-collected", label: "Due Collected" },
      { key: "rb-k-added", label: "Products Added" },
      { key: "rb-k-newdue", label: "New Dues" },
      { key: "rb-k-avg", label: "Average Order" },
      { key: "rb-k-discount", label: "Discount Given" },
      { key: "rb-k-gst", label: "GST Collected" },
      { key: "rb-k-online", label: "Online Orders Placed" },
    ],
  },
  {
    group: "rb-tl", groupLabel: "Product-wise Sales Timeline",
    items: [
      { key: "rb-c-time", label: "Time" },
      { key: "rb-c-order", label: "Order ID" },
      { key: "rb-c-channel", label: "Channel" },
      { key: "rb-c-customer", label: "Customer" },
      { key: "rb-c-phone", label: "Customer mobile" },
      { key: "rb-c-product", label: "Product" },
      { key: "rb-c-sku", label: "SKU" },
      { key: "rb-c-category", label: "Category" },
      { key: "rb-c-qty", label: "Qty" },
      { key: "rb-c-price", label: "Unit Price" },
      { key: "rb-c-total", label: "Total" },
      { key: "rb-c-gst", label: "GST" },
      { key: "rb-c-payment", label: "Payment" },
      { key: "rb-c-due", label: "Due" },
      { key: "rb-c-status", label: "Order status" },
      { key: "rb-c-staff", label: "Sold / delivered by" },
    ],
  },
  {
    group: "rb-g-products", groupLabel: "Product Summary",
    items: [
      { key: "rb-p-name", label: "Product" }, { key: "rb-p-sku", label: "SKU" }, { key: "rb-p-category", label: "Category" },
      { key: "rb-p-orders", label: "Orders" }, { key: "rb-p-qty", label: "Qty sold" }, { key: "rb-p-revenue", label: "Revenue" }, { key: "rb-p-last", label: "Last sold" },
    ],
  },
  {
    group: "rb-g-daily", groupLabel: "Day-wise Summary",
    items: [
      { key: "rb-d-day", label: "Date" }, { key: "rb-d-orders", label: "Orders" }, { key: "rb-d-offline", label: "In-store" }, { key: "rb-d-online", label: "Online" },
      { key: "rb-d-units", label: "Units" }, { key: "rb-d-sales", label: "Sales" }, { key: "rb-d-due", label: "Due" }, { key: "rb-d-collected", label: "Collected" },
    ],
  },
  {
    group: "rb-g-collections", groupLabel: "Due Collections",
    items: [
      { key: "rb-col-time", label: "Time" }, { key: "rb-col-receipt", label: "Receipt" }, { key: "rb-col-customer", label: "Customer" }, { key: "rb-col-order", label: "Order" },
      { key: "rb-col-method", label: "Method" }, { key: "rb-col-amount", label: "Amount" }, { key: "rb-col-by", label: "Received by" },
    ],
  },
  {
    group: "rb-g-dues", groupLabel: "New Dues",
    items: [
      { key: "rb-du-time", label: "Time" }, { key: "rb-du-order", label: "Order" }, { key: "rb-du-customer", label: "Customer" }, { key: "rb-du-phone", label: "Mobile" },
      { key: "rb-du-amount", label: "Due amount" }, { key: "rb-du-paid", label: "Paid since" }, { key: "rb-du-balance", label: "Balance" }, { key: "rb-du-promised", label: "Promised date" }, { key: "rb-du-status", label: "Status" },
    ],
  },
  {
    group: "rb-g-added", groupLabel: "Products Added",
    items: [
      { key: "rb-a-time", label: "Time" }, { key: "rb-a-name", label: "Product" }, { key: "rb-a-sku", label: "SKU" }, { key: "rb-a-category", label: "Category" },
      { key: "rb-a-price", label: "Price" }, { key: "rb-a-stock", label: "Stock" }, { key: "rb-a-by", label: "Added by" },
    ],
  },
  {
    group: "rb-g-agents", groupLabel: "Deliveries by Agent",
    items: [
      { key: "rb-ag-name", label: "Agent" }, { key: "rb-ag-assigned", label: "Assigned" }, { key: "rb-ag-delivered", label: "Delivered" }, { key: "rb-ag-pending", label: "Pending" },
      { key: "rb-ag-canceled", label: "Canceled" }, { key: "rb-ag-value", label: "Delivered value" }, { key: "rb-ag-avg", label: "Avg. delivery time" },
    ],
  },
  {
    group: "rb-g-staff", groupLabel: "Staff Performance",
    items: [
      { key: "rb-st-name", label: "Staff" }, { key: "rb-st-role", label: "Role" }, { key: "rb-st-pos", label: "Store sales" }, { key: "rb-st-posamt", label: "Store sales amount" },
      { key: "rb-st-col", label: "Collections" }, { key: "rb-st-colamt", label: "Collected amount" }, { key: "rb-st-delivered", label: "Delivered" }, { key: "rb-st-added", label: "Products added" },
    ],
  },
  {
    group: "rb-g-activity", groupLabel: "Staff Activity (one person)",
    items: [{ key: "rb-ac-time", label: "Time" }, { key: "rb-ac-action", label: "Action" }, { key: "rb-ac-details", label: "Details" }],
  },
  {
    group: "rb-side", groupLabel: "Right Panel",
    items: [
      { key: "rb-r-payment", label: "Payment Summary" },
      { key: "rb-r-channel", label: "Sales Channel Summary" },
      { key: "rb-r-online", label: "Online Orders by Status" },
      { key: "rb-r-aging", label: "Due Aging Summary" },
      { key: "rb-r-export", label: "Export Report" },
    ],
  },
];

/** Extra columns that start switched off (the report stays like the design until someone adds them). */
export const RB_DEFAULT_HIDDEN = ["rb-c-category", "rb-c-gst", "rb-c-status", "rb-c-staff", "rb-p-category", "rb-du-phone", "rb-k-avg", "rb-k-discount", "rb-k-gst"] as const;
