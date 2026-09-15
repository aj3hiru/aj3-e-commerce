export interface PaymentMethodDef {
  key: string;
  label: string;
  fields: { key: string; label: string; type?: "text" | "select"; options?: string[] }[];
}

/** Verified against $methods + the per-method pkey[...] form fields in payment.php. */
export const PAYMENT_METHODS: PaymentMethodDef[] = [
  { key: "cod", label: "Cash On Delivery", fields: [] },
  {
    key: "paytm", label: "Paytm",
    fields: [
      { key: "merchant_id", label: "Paytm Merchant ID" },
      { key: "merchant_key", label: "Paytm Merchant Key" },
      { key: "website", label: "Website (e.g. WEBSTAGING or DEFAULT)" },
      { key: "industry_type", label: "Industry Type (e.g. Retail)" },
      { key: "mode", label: "Mode", type: "select", options: ["test", "production"] },
    ],
  },
  {
    key: "phonepe", label: "PhonePe",
    fields: [
      { key: "merchant_id", label: "PhonePe Merchant ID" },
      { key: "salt_key", label: "Salt Key" },
      { key: "salt_index", label: "Salt Index (e.g. 1)" },
      { key: "mode", label: "Mode", type: "select", options: ["test", "production"] },
    ],
  },
  {
    key: "razorpay", label: "Razorpay",
    fields: [
      { key: "key", label: "Razorpay Key" },
      { key: "secret", label: "Razorpay Secret" },
    ],
  },
  {
    key: "bank_transfer", label: "Bank Transfer",
    fields: [
      { key: "account_name", label: "Account Holder Name" },
      { key: "account_number", label: "Account Number" },
      { key: "ifsc", label: "IFSC Code" },
      { key: "bank_name", label: "Bank Name" },
    ],
  },
];
