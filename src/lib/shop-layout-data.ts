import { prisma } from "./db";
import { getCustomerSession } from "./customer-auth";
import { getCart, cartCount } from "./cart-session";
import { getShopHeaderSettings } from "./header-settings";
import type { ShopBusinessSettings, ShopCategoryNavItem, ShopCustomer, ShopHeaderSettings } from "@/types/shop";
import { campaignSalePrices } from "@/lib/campaign-pricing";
import { getStorefrontConfig } from "@/lib/storefront-config";
import type { StorefrontConfig } from "@/types/storefront";

export interface ShopLayoutData {
  business: ShopBusinessSettings;
  header: ShopHeaderSettings;
  categories: ShopCategoryNavItem[];
  customer: ShopCustomer | null;
  cartCount: number;
  cartTotal: number;
  storefront: StorefrontConfig;
}

/** Loads everything ShopLayout needs — used at the top of every storefront page
 *  so the header/footer/cart-badge are always consistent and correctly hydrated
 *  from the current session, without each page re-implementing the same fetches. */
export async function getShopLayoutData(): Promise<ShopLayoutData> {
  const [biz, categories, customerSession, cart, storefront] = await Promise.all([
    prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } }),
    prisma.ecomCategory.findMany({ where: { status: "active" }, orderBy: { serial: "asc" } }),
    getCustomerSession(),
    getCart(),
    getStorefrontConfig(),
  ]);

  let customer: ShopCustomer | null = null;
  if (customerSession) {
    customer = { id: customerSession.customerId, name: customerSession.name };
  }

  // Depends on `biz` (business_hours is the delivery-time fallback), so this
  // runs after the Promise.all above rather than inside it.
  const [cartTotal, header] = await Promise.all([
    computeCartTotal(cart),
    getShopHeaderSettings(biz?.businessHours ?? null),
  ]);

  return {
    header,
    business: {
      businessName: biz?.businessName ?? "EduMint24",
      logo: biz?.logo ?? null,
      location: biz?.location ?? null,
      businessHours: biz?.businessHours ?? null,
      tagline: biz?.tagline ?? null,
      email: biz?.email ?? null,
      address: biz?.address ?? null,
      returnPolicy: biz?.returnPolicy ?? null,
      contactNumbers: (biz?.contactNumbers as string[]) ?? [],
      socialMedia: (biz?.socialMediaJson as { platform: never; url: string }[]) ?? [],
    },
    categories: categories.map((c: (typeof categories)[number]) => ({ slug: c.slug, name: c.name })),
    customer,
    cartCount: cartCount(cart),
    cartTotal,
    storefront,
  };
}

async function computeCartTotal(cart: Record<number, number>): Promise<number> {
  const ids = Object.keys(cart).map(Number);
  if (ids.length === 0) return 0;
  const products = await prisma.ecomProduct.findMany({ where: { id: { in: ids } }, select: { id: true, price: true, salePrice: true, categoryId: true, brandId: true } });
  const campaign = await campaignSalePrices(products); // campaign prices, so the badge matches the cart
  let total = 0;
  for (const p of products) {
    const sale = p.salePrice ? Number(p.salePrice) : 0;
    const price = Number(p.price);
    const unit = campaign.get(p.id) ?? (sale > 0 && sale < price ? sale : price);
    total += unit * (cart[p.id] ?? 0);
  }
  return total;
}
