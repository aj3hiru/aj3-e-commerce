import { prisma } from "./db";
import { getCustomerSession } from "./customer-auth";
import { getCart, cartCount, type CartMap } from "./cart-session";
import { cartTotal, loadCartLines } from "./cart-lines";
import { getShopHeaderSettings } from "./header-settings";
import type { ShopBusinessSettings, ShopCategoryNavItem, ShopCustomer, ShopHeaderSettings } from "@/types/shop";
import { getStorefrontConfig } from "@/lib/storefront-config";
import { getLiveHome } from "@/lib/home-config";
import type { PromoBar } from "@/types/home";
import type { StorefrontConfig } from "@/types/storefront";
import type { CartUi } from "@/types/product-page";
import { getLiveProductPage } from "./product-page-config";

export interface ShopLayoutData {
  business: ShopBusinessSettings;
  header: ShopHeaderSettings;
  categories: ShopCategoryNavItem[];
  customer: ShopCustomer | null;
  cartCount: number;
  cartTotal: number;
  cartItems: Record<string, number>;
  cartUi: CartUi;
  storefront: StorefrontConfig;
  promo: PromoBar;
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
  const [home, productPage] = await Promise.all([getLiveHome(), getLiveProductPage()]);
  const promo = home.promo;

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
    cartItems: cart,
    cartUi: productPage.cart,
    storefront,
    promo,
  };
}

async function computeCartTotal(cart: CartMap): Promise<number> {
  return cartTotal(await loadCartLines(cart)); // campaign/size prices, so the badge matches the cart
}
