import type { CampaignDiscountType, CampaignScope, CampaignTargetType } from "@/lib/campaign-core";

/**
 * Checks what the Campaign Offer 2 form sends before anything is saved. Pure
 * (no database) so the same rules are unit-tested. The API runs
 * parseCampaignInput() first, looks up the ids it names, then runs
 * checkCampaignRefs().
 */

export interface CleanCampaign {
  name: string;
  scope: CampaignScope;
  discountType: CampaignDiscountType;
  discountValue: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isPaused: boolean;
  targets: { targetType: CampaignTargetType; targetId: number; fixedPrice: number | null }[];
}

export type ParseResult = { ok: true; value: CleanCampaign } | { ok: false; message: string; field?: string };

const SCOPES: readonly CampaignScope[] = ["all", "category", "brand", "product"];
const TYPES: readonly CampaignDiscountType[] = ["percent", "amount", "fixed"];
export const MAX_TARGETS = 1000;

const fail = (message: string, field?: string): ParseResult => ({ ok: false, message, field });
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function parseDate(v: unknown): Date | null | "bad" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return "bad";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "bad" : d;
}

/**
 * `requireFutureEnd` is true when creating: a new campaign that has already
 * ended would be pointless. When editing it is false, so a campaign can also
 * be ended by moving its end time to now.
 */
export function parseCampaignInput(raw: unknown, now: Date, requireFutureEnd: boolean): ParseResult {
  if (!raw || typeof raw !== "object") return fail("Invalid request.");
  const b = raw as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return fail("Give the campaign a name.", "name");
  if (name.length > 150) return fail("The name can be at most 150 characters.", "name");

  const scope = b.scope as CampaignScope;
  if (!SCOPES.includes(scope)) return fail("Choose what the campaign applies to.", "scope");

  const discountType = b.discountType as CampaignDiscountType;
  if (!TYPES.includes(discountType)) return fail("Choose the type of offer.", "discountType");
  if (discountType === "fixed" && scope !== "product") return fail("A fixed price can only be used when the campaign is for specific products.", "discountType");

  // targets
  const targetsRaw = b.targets === undefined || b.targets === null ? [] : b.targets;
  if (!Array.isArray(targetsRaw)) return fail("Invalid products or groups.", "targets");
  if (targetsRaw.length > MAX_TARGETS) return fail(`Choose at most ${MAX_TARGETS} items for one campaign.`, "targets");
  const seen = new Set<number>();
  const targets: CleanCampaign["targets"] = [];
  if (scope !== "all") {
    for (const t of targetsRaw as { type?: unknown; id?: unknown; fixedPrice?: unknown }[]) {
      if (!t || t.type !== scope || !isInt(t.id) || seen.has(t.id)) return fail("Invalid products or groups.", "targets");
      seen.add(t.id);
      let fixedPrice: number | null = null;
      if (discountType === "fixed") {
        const fp = typeof t.fixedPrice === "number" ? t.fixedPrice : NaN;
        if (!Number.isFinite(fp) || fp <= 0 || fp > 9_999_999) return fail("Enter a campaign price above ₹0 for every product.", "targets");
        fixedPrice = round2(fp);
      }
      targets.push({ targetType: scope, targetId: t.id, fixedPrice });
    }
    if (targets.length === 0) {
      const what = scope === "category" ? "categories" : scope === "brand" ? "brands" : "products";
      return fail(`Choose at least one of the ${what} this campaign is for.`, "targets");
    }
  }

  // offer value
  let discountValue: number | null = null;
  if (discountType === "percent") {
    const v = typeof b.discountValue === "number" ? b.discountValue : NaN;
    if (!Number.isFinite(v) || v <= 0 || v >= 100) return fail("A percentage off must be more than 0 and less than 100.", "discountValue");
    discountValue = round2(v);
  } else if (discountType === "amount") {
    const v = typeof b.discountValue === "number" ? b.discountValue : NaN;
    if (!Number.isFinite(v) || v <= 0 || v > 9_999_999) return fail("Enter an amount off above ₹0.", "discountValue");
    discountValue = round2(v);
  }

  // schedule
  const startsAt = parseDate(b.startsAt);
  const endsAt = parseDate(b.endsAt);
  if (startsAt === "bad") return fail("The start date and time isn't valid.", "startsAt");
  if (endsAt === "bad") return fail("The end date and time isn't valid.", "endsAt");
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) return fail("The end must be after the start.", "endsAt");
  if (requireFutureEnd && endsAt && endsAt.getTime() <= now.getTime()) return fail("The end date and time must be in the future.", "endsAt");

  return {
    ok: true,
    value: { name, scope, discountType, discountValue, startsAt, endsAt, isPaused: b.isPaused === true, targets },
  };
}

/** What the API found in the database for the ids the form named. */
export interface RefLookup {
  categoryIds: ReadonlySet<number>;
  brandIds: ReadonlySet<number>;
  /** product id → regular price */
  productPrices: ReadonlyMap<number, number>;
}

/** Returns an error message, or null when every chosen item exists (and fixed prices make sense). */
export function checkCampaignRefs(c: CleanCampaign, ref: RefLookup): string | null {
  for (const t of c.targets) {
    if (t.targetType === "category" && !ref.categoryIds.has(t.targetId)) return "One of the chosen categories no longer exists. Reload the page and try again.";
    if (t.targetType === "brand" && !ref.brandIds.has(t.targetId)) return "One of the chosen brands no longer exists. Reload the page and try again.";
    if (t.targetType === "product") {
      const price = ref.productPrices.get(t.targetId);
      if (price === undefined) return "One of the chosen products no longer exists. Reload the page and try again.";
      if (c.discountType === "fixed" && t.fixedPrice !== null && t.fixedPrice >= price) {
        return "A campaign price must be lower than the product's regular price.";
      }
    }
  }
  return null;
}
