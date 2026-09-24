"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageIcon, Trash2, ShoppingCart } from "lucide-react";

export interface CartItemRow {
  key: string;
  productId: number;
  slug: string;
  name: string;
  image: string | null;
  unitPrice: number;
  qty: number;
}

export function CartTable({ items, subtotal }: { items: CartItemRow[]; subtotal: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function updateQty(key: string, qty: number) {
    setBusy(true);
    try {
      await fetch("/api/shop/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_cart_qty", key, qty }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(key: string) {
    setBusy(true);
    try {
      await fetch("/api/shop/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_from_cart", key }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-storefront-muted">
        <ShoppingCart className="w-10 h-10 mx-auto mb-3" />
        <p className="mb-3">Your cart is empty.</p>
        <Link href="/shop" className="inline-block bg-storefront-green hover:bg-storefront-green-dark text-white font-semibold rounded px-5 py-2.5">
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-storefront-border text-left">
              <th className="py-2">Product</th>
              <th className="py-2">Price</th>
              <th className="py-2">Qty</th>
              <th className="py-2">Subtotal</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} className="border-b border-storefront-border">
                <td className="py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-[52px] h-[52px] bg-storefront-bg rounded flex items-center justify-center overflow-hidden shrink-0">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/${item.image}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-storefront-muted" />
                      )}
                    </div>
                    <Link href={`/shop/product?slug=${item.slug}`} className="font-medium">{item.name}</Link>
                  </div>
                </td>
                <td className="py-3">₹{item.unitPrice.toFixed(2)}</td>
                <td className="py-3 w-28">
                  <input
                    type="number"
                    min={1}
                    defaultValue={item.qty}
                    disabled={busy}
                    onBlur={(e) => updateQty(item.key, Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 border border-storefront-border rounded px-2 py-1 text-sm"
                  />
                </td>
                <td className="py-3">₹{(item.unitPrice * item.qty).toFixed(2)}</td>
                <td className="py-3">
                  <button onClick={() => removeItem(item.key)} className="text-red-500 hover:bg-red-50 p-1.5 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg border border-storefront-border p-5 h-fit">
        <h5 className="font-bold mb-3">Order Summary</h5>
        <div className="flex justify-between mb-2">
          <span>Subtotal</span>
          <strong>₹{subtotal.toFixed(2)}</strong>
        </div>
        <p className="text-storefront-muted text-xs mb-3">Taxes and delivery calculated at checkout.</p>
        <Link href="/shop/checkout" className="block text-center bg-storefront-green hover:bg-storefront-green-dark text-white font-semibold rounded py-2.5">
          Proceed to Checkout
        </Link>
      </div>
    </div>
  );
}
