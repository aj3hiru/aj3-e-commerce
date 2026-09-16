"use client";

import { useState } from "react";
import { ShopHeader } from "./ShopHeader";
import { ShopMobileDrawer } from "./ShopMobileDrawer";
import { ShopFooter } from "./ShopFooter";
import { CartProvider } from "@/hooks/useCart";
import type { ShopBusinessSettings, ShopCategoryNavItem, ShopCustomer } from "@/types/shop";

interface ShopLayoutProps {
  business: ShopBusinessSettings;
  categories: ShopCategoryNavItem[];
  customer: ShopCustomer | null;
  cartCount: number;
  cartTotal: number;
  children: React.ReactNode;
}

export function ShopLayout({ business, categories, customer, cartCount, cartTotal, children }: ShopLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <CartProvider initialCount={cartCount} initialTotal={cartTotal}>
      <div className="min-h-screen flex flex-col bg-white">
        <ShopHeader
          business={business}
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
      </div>
    </CartProvider>
  );
}
