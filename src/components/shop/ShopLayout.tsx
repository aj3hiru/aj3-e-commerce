"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { ShopHeader } from "./ShopHeader";
import { ShopMobileDrawer } from "./ShopMobileDrawer";
import { ShopFooter } from "./ShopFooter";
import { PushProvider } from "./push/PushContext";
import { PromoBar } from "./PromoBar";
import type { PromoBar as PromoConfig } from "@/types/home";
import { resolveMenu } from "./menu/StoreMenus";
import { CartProvider } from "@/hooks/useCart";
import { defaultShopHeaderSettings } from "@/lib/shop-header-defaults";
import { DEFAULT_STOREFRONT, type StorefrontConfig } from "@/types/storefront";
import type { ShopBusinessSettings, ShopCategoryNavItem, ShopCustomer, ShopHeaderSettings } from "@/types/shop";

interface ShopLayoutProps {
  business: ShopBusinessSettings;
  /** Optional: the DB-free demo route renders a header without reading the
   *  customizer table, and falls back to the PHP defaults. */
  header?: ShopHeaderSettings;
  categories: ShopCategoryNavItem[];
  customer: ShopCustomer | null;
  cartCount: number;
  cartTotal: number;
  /** Menus, menu design, push bell/prompt and footer from Business Settings. */
  storefront?: StorefrontConfig;
  /** Offer strip above the header, from the Homepage Customizer. */
  promo?: PromoConfig | null;
  children: React.ReactNode;
}

export function ShopLayout({ business, header, categories, customer, cartCount, cartTotal, storefront = DEFAULT_STOREFRONT, promo = null, children }: ShopLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const headerSettings = header ?? defaultShopHeaderSettings(business.businessHours);
  const loggedIn = !!customer;
  const headerMenu = useMemo(() => resolveMenu(storefront.headerMenu, loggedIn, categories), [storefront.headerMenu, loggedIn, categories]);
  const sidebarMenu = useMemo(() => resolveMenu(storefront.sidebarMenu, loggedIn, categories), [storefront.sidebarMenu, loggedIn, categories]);

  return (
    <CartProvider initialCount={cartCount} initialTotal={cartTotal}>
      <PushProvider config={storefront.push}>
        {/* font-storefront: the shop uses Segoe UI, not the admin's Inter — see
            the `body` rule at the top of shop-header.php. */}
        <div className="font-storefront min-h-screen flex flex-col bg-white">
          {promo && <PromoBar promo={promo} />}
          <ShopHeader
            business={business}
            header={headerSettings}
            customer={customer}
            menu={headerMenu}
            design={storefront.menuDesign}
            onOpenMobileMenu={() => setDrawerOpen(true)}
          />
          <Suspense fallback={null}>
            <ShopMobileDrawer
              business={business}
              header={headerSettings}
              customer={customer}
              menu={sidebarMenu}
              design={storefront.menuDesign}
              isOpen={drawerOpen}
              onClose={closeDrawer}
            />
          </Suspense>
          <div className="flex-1 max-w-[1360px] w-full mx-auto px-8 py-6">
            {children}
          </div>
          <ShopFooter business={business} footer={storefront.footer} />
        </div>
      </PushProvider>
    </CartProvider>
  );
}
