"use client";

import { useState } from "react";
import { ShopHeader } from "./ShopHeader";
import { ShopMobileDrawer } from "./ShopMobileDrawer";
import { ShopFooter } from "./ShopFooter";
import { PushOptIn } from "./PushOptIn";
import { CartProvider } from "@/hooks/useCart";
import { defaultShopHeaderSettings } from "@/lib/shop-header-defaults";
import type { ShopBusinessSettings, ShopCategoryNavItem, ShopCustomer, ShopHeaderSettings } from "@/types/shop";

interface ShopLayoutProps {
  business: ShopBusinessSettings;
  /** Optional: auth pages and the DB-free demo route render a header without
   *  reading the customizer table, and fall back to the PHP defaults. */
  header?: ShopHeaderSettings;
  categories: ShopCategoryNavItem[];
  customer: ShopCustomer | null;
  cartCount: number;
  cartTotal: number;
  children: React.ReactNode;
}

export function ShopLayout({ business, header, categories, customer, cartCount, cartTotal, children }: ShopLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const headerSettings = header ?? defaultShopHeaderSettings(business.businessHours);

  return (
    <CartProvider initialCount={cartCount} initialTotal={cartTotal}>
      {/* font-storefront: the shop uses Segoe UI, not the admin's Inter — see
          the `body` rule at the top of shop-header.php. */}
      <div className="font-storefront min-h-screen flex flex-col bg-white">
        <ShopHeader
          business={business}
          header={headerSettings}
          categories={categories}
          customer={customer}
          onOpenMobileMenu={() => setDrawerOpen(true)}
        />
        <ShopMobileDrawer
          business={business}
          customer={customer}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
        <div className="flex-1 max-w-[1360px] w-full mx-auto px-8 py-6">
          {children}
        </div>
        <ShopFooter business={business} />
        <PushOptIn appName={business.businessName} />
      </div>
    </CartProvider>
  );
}
