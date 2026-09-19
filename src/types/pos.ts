export interface PosProduct {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  salePrice: number | null;
  gstRate: number;
  stockQty: number | null;
  productType: string;
  categoryId: number | null;
  subcategoryId: number | null;
  /** Sold-by unit label ("KG", "Liter", "Piece", a custom string, or null
   *  for a plain countable product). Display-only on the billing screen —
   *  quantity itself stays a whole number either way. */
  unit: string | null;
}

export interface PosCoupon {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  appliesTo: "all" | "product" | "category" | "subcategory";
  productId?: number | null;
  categoryId?: number | null;
  subcategoryId?: number | null;
}

export interface PosCustomer {
  id: number;
  name: string;
  phone: string | null;
}

export interface CartLine {
  productId: number;
  name: string;
  unitPrice: number;
  qty: number;
  stockQty: number | null;
  productType: string;
  categoryId: number | null;
  subcategoryId: number | null;
  gstRate: number;
  priceOverridden?: boolean;
  unit?: string | null;
}

export interface PaymentRow {
  id: string;
  method: "Cash" | "Card" | "UPI" | "Other";
  amount: string; // kept as string to match a live text input
}

export interface BusinessPosSettings {
  posPrintMode: "both" | "thermal" | "a4";
  printerFormat: "thermal_58" | "thermal_80";
  shortcutCompleteSale: string;
  shortcutPrint: string;
  shortcutNewSale: string;
}
