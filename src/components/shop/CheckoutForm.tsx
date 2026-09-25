"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, ImageIcon, Loader2, MapPin, TicketPercent, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddressPicker } from "@/components/shop/address/Address";
import type { SavedAddress } from "@/lib/customer-addresses";
import { Notice, PriceRow, Section, Steps, StickyBottom, btnPrimary, inputCls, rupees } from "@/components/shop/ui/Meesho";

export interface CheckoutItemSummary {
  name: string;
  qty: number;
  lineTotal: number;
  image?: string | null;
}

interface CheckoutFormProps {
  addresses: SavedAddress[];
  customerName?: string;
  customerPhone?: string | null;
  paymentMethods: { methodKey: string; name: string }[];
  items: CheckoutItemSummary[];
  subtotal: number;
  estimatedGst: number;
}

const payIcon = (key: string) => (/cod|cash/i.test(key) ? Banknote : /upi|wallet/i.test(key) ? Wallet : CreditCard);

/** Checkout (Meesho style): address, payment, coupon, order summary, and a sticky Place Order bar. */
export function CheckoutForm({ addresses, customerName, customerPhone, paymentMethods, items, subtotal, estimatedGst }: CheckoutFormProps) {
  const router = useRouter();
  const [addressId, setAddressId] = useState<number | null>(null);
  const pickAddress = useCallback((id: number | null) => { setAddressId(id); setError(""); }, []);
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods.length === 1 ? paymentMethods[0].methodKey : "");
  const [couponCode, setCouponCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const total = subtotal + estimatedGst;
  const step = !addressId ? 1 : !paymentMethod ? 2 : 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addressId) { setError("Please add or choose a delivery address."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!paymentMethod) { setError("Please select a payment method."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId, paymentMethod, couponCode }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Could not place order."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      router.push(`/shop/order?id=${data.order_id}&placed=1`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="-mt-2 mb-2"><Steps active={step} /></div>
      {error && <div className="mb-2 bg-white px-4 py-3"><Notice tone="error">{error}</Notice></div>}

      <Section title={<span className="flex items-center gap-2"><MapPin className="h-[18px] w-[18px] text-[var(--hp-accent)]" />Delivery Address</span>}>
        <AddressPicker initial={addresses} defaults={{ name: customerName, phone: customerPhone ?? undefined }} value={addressId} onChange={pickAddress} />
      </Section>

      <Section title="Payment Method">
        {paymentMethods.length === 0 ? (
          <p className="text-[14px] text-[#8b8ba3]">No payment methods are available right now. Please contact us.</p>
        ) : (
          <div className="space-y-2.5">
            {paymentMethods.map((pm) => {
              const on = paymentMethod === pm.methodKey, Icon = payIcon(pm.methodKey);
              return (
                <label key={pm.methodKey} className={cn("flex cursor-pointer items-center gap-3 rounded-[6px] border px-3.5 py-3 transition",
                  on ? "border-[var(--hp-accent)] bg-[color-mix(in_srgb,var(--hp-accent)_6%,white)]" : "border-[#dcdce6]")}>
                  <input type="radio" name="payment_method" value={pm.methodKey} checked={on} onChange={(e) => { setPaymentMethod(e.target.value); setError(""); }} className="sr-only" />
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-[var(--hp-accent)]" : "border-[#b9b9c9]")}>
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-[var(--hp-accent)]" />}
                  </span>
                  <span className="flex-1 text-[15px] font-medium">{pm.name}</span>
                  <Icon className={cn("h-5 w-5", on ? "text-[var(--hp-accent)]" : "text-[#8b8ba3]")} strokeWidth={1.8} />
                </label>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={<span className="flex items-center gap-2"><TicketPercent className="h-[18px] w-[18px] text-[var(--hp-accent)]" />Apply Coupon</span>}>
        <input type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Enter coupon code"
          className={cn(inputCls, "h-11 uppercase tracking-wider")} />
        <p className="mt-1.5 text-[12px] text-[#8b8ba3]">The discount is applied when you place the order.</p>
      </Section>

      <Section title={`Order Summary (${items.reduce((n, i) => n + i.qty, 0)})`}>
        <ul className="divide-y divide-[#eaeaf2]">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[4px] border border-[#eaeaf2] bg-white">
                {it.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/${it.image}`} alt="" className="h-full w-full object-contain" />
                  : <span className="grid h-full w-full place-items-center bg-[#f5f5f8] text-[#c9c9d6]"><ImageIcon className="h-5 w-5" /></span>}
              </span>
              <span className="min-w-0 flex-1"><span className="line-clamp-2 text-[14px] leading-5">{it.name}</span><span className="text-[12px] text-[#8b8ba3]">Qty: {it.qty}</span></span>
              <span className="text-[14px] font-semibold">{rupees(it.lineTotal)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Price Details" id="price-details">
        <PriceRow label="Items total" value={rupees(subtotal)} />
        <PriceRow label="Estimated GST" value={`+ ${rupees(estimatedGst)}`} />
        <div className="my-1.5 border-t border-dashed border-[#dcdce6]" />
        <PriceRow label="Order Total" value={rupees(total)} bold />
      </Section>

      <StickyBottom>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[18px] font-bold">{rupees(total)}</p>
          <a href="#price-details" className="text-[12px] font-bold uppercase text-[var(--hp-accent)]">View price details</a>
        </div>
        <button type="submit" disabled={submitting || paymentMethods.length === 0} className={cn(btnPrimary, "h-12 w-[52%]")}>
          {submitting ? <><Loader2 className="h-5 w-5 animate-spin" />Placing…</> : "Place Order"}
        </button>
      </StickyBottom>
    </form>
  );
}
