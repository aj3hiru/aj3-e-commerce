"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CheckoutItemSummary {
  name: string;
  qty: number;
  lineTotal: number;
}

interface CheckoutFormProps {
  initialAddress: string;
  paymentMethods: { methodKey: string; name: string }[];
  items: CheckoutItemSummary[];
  subtotal: number;
  estimatedGst: number;
}

/** Verified against the checkout form in checkout.php. */
export function CheckoutForm({ initialAddress, paymentMethods, items, subtotal, estimatedGst }: CheckoutFormProps) {
  const router = useRouter();
  const [address, setAddress] = useState(initialAddress);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) {
      setError("Please enter a delivery address.");
      return;
    }
    if (!paymentMethod) {
      setError("Please select a payment method.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, paymentMethod, couponCode }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Could not place order.");
        return;
      }
      router.push(`/shop/order?id=${data.order_id}&placed=1`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-4 py-2.5">{error}</div>}

        <div className="bg-white rounded-lg border border-storefront-border p-5">
          <h5 className="font-bold mb-3">Delivery Address</h5>
          <textarea
            required
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Full address for delivery"
            className="w-full border border-storefront-border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="bg-white rounded-lg border border-storefront-border p-5">
          <h5 className="font-bold mb-3">Payment Method</h5>
          {paymentMethods.length === 0 ? (
            <p className="text-storefront-muted text-sm">No payment methods are currently available. Please contact us.</p>
          ) : (
            <div className="space-y-2">
              {paymentMethods.map((pm) => (
                <label key={pm.methodKey} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="payment_method" required value={pm.methodKey} checked={paymentMethod === pm.methodKey} onChange={(e) => setPaymentMethod(e.target.value)} />
                  {pm.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-storefront-border p-5">
          <h5 className="font-bold mb-3">Coupon Code</h5>
          <input
            type="text"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder="Have a coupon? Enter it here"
            className="w-full border border-storefront-border rounded px-3 py-2 text-sm uppercase"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-storefront-border p-5 h-fit">
        <h5 className="font-bold mb-3">Order Summary</h5>
        {items.map((it, i) => (
          <div key={i} className="flex justify-between text-sm mb-2">
            <span>{it.name} × {it.qty}</span>
            <span>₹{it.lineTotal.toFixed(2)}</span>
          </div>
        ))}
        <hr className="my-3 border-storefront-border" />
        <div className="flex justify-between font-bold"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-storefront-muted text-sm"><span>Estimated GST</span><span>+₹{estimatedGst.toFixed(2)}</span></div>
        <p className="text-storefront-muted text-xs mt-2">Coupon discount (if any) is applied when you place the order.</p>
        <button type="submit" disabled={submitting} className="w-full bg-storefront-green hover:bg-storefront-green-dark text-white font-semibold rounded py-2.5 mt-3 disabled:opacity-60">
          {submitting ? "Placing Order…" : "Place Order"}
        </button>
      </div>
    </form>
  );
}
