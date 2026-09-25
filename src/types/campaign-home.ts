/**
 * Campaign Offer → "Show on homepage". Stored as JSON on the campaign
 * (ecom_campaigns.home_display). Active campaigns with `show` on appear just
 * above "Products For You"; several of them become a slider.
 */

export type CampaignTemplate = "bold" | "soft" | "ticket" | "festive" | "minimal";

export interface CampaignHome {
  show: boolean;
  template: CampaignTemplate;
  /** Headline; blank = the campaign's name. */
  title: string;
  /** Second line; blank = an automatic line about the offer. */
  subtitle: string;
  color: string;
  cta: string;
}

export const CAMPAIGN_TEMPLATES: { id: CampaignTemplate; name: string; blurb: string }[] = [
  { id: "bold", name: "Bold", blurb: "Colour gradient, big discount" },
  { id: "soft", name: "Soft", blurb: "Light tint, dark text" },
  { id: "ticket", name: "Coupon ticket", blurb: "Tear-off coupon look" },
  { id: "festive", name: "Festive", blurb: "Dark with gold sparkle" },
  { id: "minimal", name: "Minimal strip", blurb: "One slim line" },
];

export const DEFAULT_CAMPAIGN_HOME: CampaignHome = { show: false, template: "bold", title: "", subtitle: "", color: "#9f2089", cta: "Shop Now" };

export function sanitizeCampaignHome(v: unknown): CampaignHome {
  const r = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const str = (x: unknown, max: number, d = "") => (typeof x === "string" ? x.trim().slice(0, max) : d);
  return {
    show: r.show === true,
    template: CAMPAIGN_TEMPLATES.some((t) => t.id === r.template) ? (r.template as CampaignTemplate) : DEFAULT_CAMPAIGN_HOME.template,
    title: str(r.title, 80),
    subtitle: str(r.subtitle, 120),
    color: /^#[0-9a-f]{6}$/i.test(String(r.color)) ? String(r.color) : DEFAULT_CAMPAIGN_HOME.color,
    cta: str(r.cta, 24, DEFAULT_CAMPAIGN_HOME.cta) || DEFAULT_CAMPAIGN_HOME.cta,
  };
}

/** Everything a homepage banner needs (built on the server from the campaign). */
export interface CampaignBannerData {
  id: number;
  home: CampaignHome;
  name: string;
  /** "20% OFF", "₹100 OFF", "Special prices". */
  offer: string;
  /** What it applies to, e.g. "on all products", "on Sarees". */
  appliesTo: string;
  endsAt: string | null;
  href: string;
}

export function offerLabel(discountType: string, value: number | null): string {
  if (discountType === "percent" && value) return `${Number.isInteger(value) ? value : value.toFixed(1)}% OFF`;
  if (discountType === "amount" && value) return `₹${Number.isInteger(value) ? value : value.toFixed(2)} OFF`;
  return "Special prices";
}
