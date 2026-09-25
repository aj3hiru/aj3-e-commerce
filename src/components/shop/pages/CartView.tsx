"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, Minus, PartyPopper, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAddToCart } from "@/hooks/useAddToCart";
import { Empty, PriceRow, Section, StickyBottom, btnPrimary, rupees } from "@/components/shop/ui/Meesho";

export interface CartViewItem {
  key: string; slug: string; name: string; size: string | null; image: string | null;
  unitPrice: number; mrp: number; qty: number; maxQty: number | null;
}

/** Meesho-style cart: product cards with − qty +, price details, and a sticky Continue bar. */
export function CartView({ items: initial }: { items: CartViewItem[] }) {
  const router = useRouter();
  const { setQty } = useAddToCart();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function change(key: string, qty: number) {
    setBusy(key); setError("");
    const res = await setQty(key, qty);
    setBusy(null);
    if (!res?.success) { setError(res?.message || "Couldn't update the cart."); return; }
    const server = res.items ?? {};
    setItems((list) => list.flatMap((it) => (server[it.key] ? [{ ...it, qty: server[it.key] }] : [])));
    router.refresh(); // re-price from the server (campaigns, stock)
  }

  if (items.length === 0) {
    return (
      <Empty icon={ShoppingCart} title="Your cart is empty" text="Just relax, let us help you find some first-class products."
        action={<Link href="/shop" className={cn(btnPrimary, "w-56")}>Start Shopping</Link>} />
    );
  }

  const count = items.reduce((n, i) => n + i.qty, 0);
  const mrpTotal = items.reduce((n, i) => n + Math.max(i.mrp, i.unitPrice) * i.qty, 0);
  const total = items.reduce((n, i) => n + i.unitPrice * i.qty, 0);
  const saved = Math.max(0, mrpTotal - total);

  return (
    <>
      <Section title={`Product Details (${items.length})`} className="pb-1">
        {error && <p className="mb-2 text-[13px] font-medium text-[#d0263a]">{error}</p>}
        <ul className="divide-y divide-[#eaeaf2]">
          {items.map((it) => {
            const off = it.mrp > it.unitPrice ? Math.round(((it.mrp - it.unitPrice) / it.mrp) * 100) : 0;
            const atMax = it.maxQty !== null && it.qty >= it.maxQty;
            return (
              <li key={it.key} className={cn("flex gap-3 py-3.5 transition-opacity", busy === it.key && "opacity-60")}>
                <Link href={`/shop/product?slug=${encodeURIComponent(it.slug)}`} className="h-[84px] w-[70px] shrink-0 overflow-hidden rounded-[6px] border border-[#eaeaf2] bg-white">
                  {it.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={`/${it.image}`} alt="" className="h-full w-full object-contain" />
                    : <span className="grid h-full w-full place-items-center bg-[#f5f5f8] text-[#c9c9d6]"><ImageIcon className="h-6 w-6" /></span>}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/shop/product?slug=${encodeURIComponent(it.slug)}`} className="line-clamp-2 text-[14px] leading-5 text-[#353543]">{it.name}</Link>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                    <b className="text-[16px] font-bold">{rupees(it.unitPrice)}</b>
                    {off > 0 && <><s className="text-[12px] text-[#8b8ba3]">{rupees(it.mrp)}</s><span className="text-[12px] font-semibold text-[#038d63]">{off}% off</span></>}
                  </div>
                  {it.size && <p className="mt-0.5 text-[12px] text-[#8b8ba3]">Size: <span className="text-[#353543]">{it.size}</span></p>}
                  <div className="mt-2 flex items-center gap-3">
                    <div className="grid h-8 grid-cols-[32px_36px_32px] items-center overflow-hidden rounded-[4px] border border-[#cfcedc]">
                      <button type="button" onClick={() => change(it.key, it.qty - 1)} disabled={!!busy} aria-label="Decrease quantity" className="grid h-full place-items-center text-[#353543] disabled:opacity-40"><Minus className="h-4 w-4" strokeWidth={2.4} /></button>
                      <span className="grid h-full place-items-center border-x border-[#cfcedc] text-[14px] font-semibold tabular-nums">{busy === it.key ? <Loader2 className="h-4 w-4 animate-spin text-[var(--hp-accent)]" /> : it.qty}</span>
                      <button type="button" onClick={() => change(it.key, it.qty + 1)} disabled={!!busy || atMax} aria-label="Increase quantity" className="grid h-full place-items-center text-[#353543] disabled:opacity-40"><Plus className="h-4 w-4" strokeWidth={2.4} /></button>
                    </div>
                    <button type="button" onClick={() => change(it.key, 0)} disabled={!!busy} className="flex items-center gap-1 text-[13px] font-medium text-[#616173] hover:text-[#d0263a]">
                      <Trash2 className="h-4 w-4" strokeWidth={1.8} />Remove
                    </button>
                  </div>
                  {atMax && <p className="mt-1 text-[12px] text-[#f16b24]">Only {it.maxQty} available</p>}
                </div>
                <p className="shrink-0 text-right text-[14px] font-semibold">{rupees(it.unitPrice * it.qty)}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={`Price Details (${count} Item${count === 1 ? "" : "s"})`} id="price-details">
        <PriceRow label="Total Product Price" value={`+ ${rupees(mrpTotal)}`} />
        {saved > 0 && <PriceRow label="Total Discounts" value={`- ${rupees(saved)}`} tone="green" />}
        <div className="my-1.5 border-t border-dashed border-[#dcdce6]" />
        <PriceRow label="Order Total" value={rupees(total)} bold />
        <p className="mt-1 text-[12px] text-[#8b8ba3]">GST and any coupon are applied at checkout.</p>
        {saved > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-[6px] bg-[#e7f8ee] px-3 py-2.5 text-[14px] font-semibold text-[#038d63]">
            <PartyPopper className="h-5 w-5" />Yay! Your total discount is {rupees(saved)}
          </div>
        )}
      </Section>

      <StickyBottom>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[18px] font-bold">{rupees(total)}</p>
          <a href="#price-details" className="text-[12px] font-bold uppercase text-[var(--hp-accent)]">View price details</a>
        </div>
        <Link href="/shop/checkout" className={cn(btnPrimary, "h-12 w-[52%]")}>Continue</Link>
      </StickyBottom>
    </>
  );
}
