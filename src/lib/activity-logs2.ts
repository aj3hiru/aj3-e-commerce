export type LogSeverity = "low" | "medium" | "high";

/**
 * Severity is a DERIVED classification of the real actionType — the schema
 * has no severity column. Buckets: destructive/security-sensitive actions
 * are "high", account/setting/status changes are "medium", everything else
 * (create/read-ish, routine updates) is "low". Unknown future actionTypes
 * default to "low" rather than being silently miscounted as risky.
 */
const HIGH: readonly string[] = [
  "login_blocked", "login_denied", "logs_clear", "user_delete", "ecom_product_delete", "ecom_category_delete",
  "ecom_customer_delete", "ecom_coupon_delete", "ecom_brand_delete", "ecom_subcategory_delete", "ecom_tag_delete",
  "ecom_campaign_delete", "ecom_review_delete",
];
const MEDIUM: readonly string[] = [
  "user_create", "user_edit", "ecom_payment_update", "ecom_business_settings_update", "ecom_homepage_update",
  "ecom_coupon_pause", "ecom_coupon_resume", "ecom_gst_update", "ecom_product_stock_update",
];
/** Failed / blocked attempts — what the "Failed Actions" card counts. */
const FAILED: readonly string[] = ["login_blocked", "login_denied"];
/** Account-and-access-related — what the "Security Events" card counts. */
const SECURITY: readonly string[] = ["login_success", "login_blocked", "login_denied", "logs_clear", "user_create", "user_delete", "user_edit"];

export function classifySeverity(actionType: string): LogSeverity {
  if (HIGH.includes(actionType)) return "high";
  if (MEDIUM.includes(actionType)) return "medium";
  return "low";
}
export function isFailedAction(actionType: string): boolean {
  return FAILED.includes(actionType);
}
export function isSecurityAction(actionType: string): boolean {
  return SECURITY.includes(actionType);
}

/** A human label for an actionType key, e.g. "ecom_product_delete" → "Product Deleted". */
export function actionLabel(actionType: string): string {
  const words = actionType.replace(/^ecom_/, "").split("_");
  const past: Record<string, string> = { create: "Created", update: "Updated", delete: "Deleted", edit: "Updated" };
  const mapped = words.map((w, i) => (i === words.length - 1 && past[w] ? past[w] : w[0].toUpperCase() + w.slice(1)));
  // Verb-first reads more like an event name: "Product Deleted" not "Deleted Product".
  if (past[words[words.length - 1]]) return mapped.join(" ");
  return mapped.join(" ");
}

export interface ParsedUA { browser: string; os: string }

/** Minimal, hand-rolled UA parsing (no dependency) — good enough to label
 *  the real stored user_agent string with a browser/OS name, the same way
 *  every other derived display value on this page is computed from real
 *  stored data rather than added as a new field. */
export function parseUserAgent(ua: string | null): ParsedUA {
  if (!ua) return { browser: "Unknown", os: "Unknown" };
  let browser = "Unknown";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) browser = "Safari";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";

  let os = "Unknown";
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/mac os x/i.test(ua) && !/iphone|ipad/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";

  return { browser, os };
}
