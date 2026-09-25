import Link from "next/link";
import { ChevronRight, Heart, LogOut, Package, ShoppingCart, Truck } from "lucide-react";
import { AccountProfileForm } from "@/components/shop/AccountProfileForm";
import { Notice, Page } from "@/components/shop/ui/Meesho";
import { OrderCard } from "@/components/shop/pages/Orders";
import type { OrderSummary } from "@/lib/customer-orders";

export interface AccountData {
  name: string; email: string; phone: string; address: string; welcomeStore: string | null;
  orders: OrderSummary[]; orderCount: number; wishCount: number; cartCount: number;
}

/** Account (Meesho style): profile header, shortcuts, recent orders, Edit Profile, Logout. */
export function AccountView({ a }: { a: AccountData }) {
  const { name, email, phone, address, welcomeStore, orders, orderCount } = a;
  const tiles = [
    { href: "/shop/order", label: "Orders", n: orderCount, icon: Package },
    { href: "/shop/wishlist", label: "Wishlist", n: a.wishCount, icon: Heart },
    { href: "/shop/cart", label: "Cart", n: a.cartCount, icon: ShoppingCart },
  ];
  return (
      <Page title="My Account">
        {welcomeStore && <div className="mb-2 bg-white px-4 py-3"><Notice tone="success">Welcome to {welcomeStore}! Your account has been created.</Notice></div>}

        <section className="mb-2 bg-white px-4 pb-4 pt-5">
          <div className="flex items-center gap-3.5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--hp-accent)_12%,white)] text-[22px] font-bold text-[var(--hp-accent)]">
              {name.trim().charAt(0).toUpperCase() || "U"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-semibold">{name}</p>
              <p className="truncate text-[13px] text-[#8b8ba3]">{[phone, email].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {tiles.map((t) => (
              <Link key={t.label} href={t.href} className="flex flex-col items-center gap-1 rounded-[8px] border border-[#eaeaf2] py-3 transition active:bg-[#f8f9fe]">
                <t.icon className="h-[22px] w-[22px] text-[var(--hp-accent)]" strokeWidth={1.8} />
                <span className="text-[16px] font-bold leading-5">{t.n}</span>
                <span className="text-[12px] text-[#616173]">{t.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <div id="orders" className="flex items-center justify-between bg-white px-4 pb-1 pt-4">
          <h2 className="text-[16px] font-semibold">Recent Orders</h2>
          {orderCount > 0 && <Link href="/shop/order" className="text-[13px] font-bold uppercase text-[var(--hp-accent)]">View all</Link>}
        </div>
        {orders.length === 0
          ? <p className="mb-2 bg-white px-4 pb-4 pt-2 text-[14px] text-[#8b8ba3]">No orders yet. <Link href="/shop" className="font-semibold text-[var(--hp-accent)]">Start shopping</Link></p>
          : orders.map((o) => <OrderCard key={o.id} o={o} />)}

        <AccountProfileForm name={name} email={email} phone={phone} address={address} open={!address} />

        <section className="mb-2 bg-white">
          <Link href="/shop/order" className="flex items-center gap-3.5 border-b border-[#eaeaf2] px-4 py-4">
            <Truck className="h-5 w-5 text-[#666]" strokeWidth={1.7} /><span className="flex-1 text-[15px] font-medium">Track Orders</span><ChevronRight className="h-5 w-5 text-[#a7a9b6]" />
          </Link>
          <Link href="/shop/wishlist" className="flex items-center gap-3.5 border-b border-[#eaeaf2] px-4 py-4">
            <Heart className="h-5 w-5 text-[#666]" strokeWidth={1.7} /><span className="flex-1 text-[15px] font-medium">My Wishlist</span><ChevronRight className="h-5 w-5 text-[#a7a9b6]" />
          </Link>
          <form action="/api/auth/customer-logout" method="POST">
            <button type="submit" className="flex w-full items-center gap-3.5 px-4 py-4 text-left text-[#d0263a]">
              <LogOut className="h-5 w-5" strokeWidth={1.7} /><span className="flex-1 text-[15px] font-medium">Logout</span>
            </button>
          </form>
        </section>
      </Page>
  );
}
