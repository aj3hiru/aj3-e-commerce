import Link from "next/link";
import { SearchX } from "lucide-react";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { Empty, Page, btnOutline, btnPrimary } from "@/components/shop/ui/Meesho";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { cn } from "@/lib/utils";

/** 404 for the whole site, in the storefront's Meesho style. */
export default async function NotFound() {
  const layoutData = await getShopLayoutData().catch(() => null);
  const body = (
    <Page title="Page not found" back="/shop">
      <Empty icon={SearchX} title="Oops! We couldn't find that page" text="The product or page may have been removed, or the link is wrong. Try searching instead."
        action={
          <div className="flex w-[260px] flex-col gap-2.5">
            <Link href="/shop" className={cn(btnPrimary, "w-full")}>Go to Home</Link>
            <form action="/shop" method="GET" className="flex">
              <input name="q" placeholder="Search products" className="h-11 min-w-0 flex-1 rounded-l-[4px] border border-r-0 border-[#cfcedc] px-3 text-[14px] outline-none focus:border-[var(--hp-accent)]" />
              <button type="submit" className={cn(btnOutline, "rounded-l-none px-4")}>Search</button>
            </form>
          </div>
        } />
    </Page>
  );
  return layoutData ? <ShopLayout {...layoutData}>{body}</ShopLayout> : <div className="p-6" style={{ ["--hp-accent" as string]: "#9f2089" }}>{body}</div>;
}
