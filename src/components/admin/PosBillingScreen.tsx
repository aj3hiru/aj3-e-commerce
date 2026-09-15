"use client";

import { useEffect, useRef, useState } from "react";
import { Barcode, ShoppingBasket, User, Tag, Wallet, Plus, Trash2, CheckCircle2, Info } from "lucide-react";
import { usePosCart } from "@/hooks/usePosCart";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useProductScan } from "@/hooks/useProductScan";
import type { PosProduct, PosCoupon, PosCustomer, BusinessPosSettings } from "@/types/pos";
import { cn } from "@/lib/utils";

const fmt = (n: number) => `₹${n.toFixed(2)}`;

interface PosBillingScreenProps {
  allProducts: PosProduct[];
  allCoupons: PosCoupon[];
  allCustomers: PosCustomer[];
  posSettings: BusinessPosSettings;
  preselectedCustomer?: PosCustomer | null;
}

/**
 * Verified 1:1 against admin/ecommerce/billing.php — the "Billing / POS" screen.
 * Layout: left column = scan box + cart table, right column = customer / coupon /
 * payment+totals cards. Every interaction (scan-on-Enter, live search dropdown,
 * qty +/- controls, price override, split payments auto-filling, guest-bill toggle,
 * configurable F2/F3/F4 keyboard shortcuts) mirrors the original script.js logic.
 */
export function PosBillingScreen({
  allProducts,
  allCoupons,
  allCustomers,
  posSettings,
  preselectedCustomer,
}: PosBillingScreenProps) {
  const {
    cart, addToCart, changeQty, setQty, setPrice, removeFromCart,
    appliedCoupon, couponMessage, applyCoupon, totals,
    payments, paidTotal, due, addPaymentRow, removePaymentRow, updatePaymentRow,
    resetForNextSale,
  } = usePosCart();

  const scan = useProductScan(allProducts, addToCart);
  const customer = useCustomerSearch(allCustomers);

  const [isGuest, setIsGuest] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (preselectedCustomer) customer.preselect(preselectedCustomer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedCustomer]);

  function toggleGuestBill(checked: boolean) {
    setIsGuest(checked);
    if (checked) {
      customer.reset();
    }
  }

  function printOrder(orderId: number) {
    const url =
      posSettings.posPrintMode === "thermal"
        ? `/admin/ecommerce/invoice/${orderId}?format=${posSettings.printerFormat}`
        : posSettings.posPrintMode === "a4"
        ? `/admin/ecommerce/invoice/${orderId}?format=a4`
        : `/admin/ecommerce/invoice/${orderId}`;
    window.open(url, "_blank");
  }

  async function completeSale() {
    if (cart.length === 0) {
      alert("Cart is empty.");
      return;
    }
    if (isGuest && due > 0.004) {
      alert("Guest bills must be paid in full. Turn off Guest Bill to record a due amount against a customer.");
      return;
    }
    if (!isGuest && due > 0.004 && !customer.customerId && !customer.name.trim()) {
      alert("This sale has a due amount — please select an existing customer or enter a walk-in customer name so it can be tracked.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ecommerce/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            product_id: c.productId,
            qty: c.qty,
            price_override: c.priceOverridden ? c.unitPrice : null,
          })),
          customer_id: isGuest ? 0 : customer.customerId ?? 0,
          customer_name: isGuest ? "" : customer.name.trim(),
          customer_phone: isGuest ? "" : customer.phone.trim(),
          is_guest: isGuest,
          payments: payments.map((p) => ({ method: p.method, amount: parseFloat(p.amount) || 0 })),
          promised_date: promisedDate || null,
          coupon_code: appliedCoupon?.code ?? "",
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || "Checkout failed.");
        return;
      }

      printOrder(data.order_id);

      // Reset for next sale — matches the PHP reset block after a successful sale.
      resetForNextSale();
      setPromisedDate("");
      setCouponCode("");
      customer.reset();
      setIsGuest(false);
      setLastOrderId(data.order_id);
      scanInputRef.current?.focus();
    } catch {
      alert("Checkout failed — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Configurable keyboard shortcuts (F2/F3/F4 by default, from Business Settings) ──
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === posSettings.shortcutCompleteSale) {
        e.preventDefault();
        completeSale();
      } else if (e.key === posSettings.shortcutPrint) {
        e.preventDefault();
        if (lastOrderId) printOrder(lastOrderId);
      } else if (e.key === posSettings.shortcutNewSale) {
        e.preventDefault();
        resetForNextSale();
        scanInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posSettings, lastOrderId, cart, isGuest, customer.customerId, customer.name, payments, appliedCoupon, promisedDate]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
      {/* LEFT: Scan + Cart */}
      <div className="space-y-5">
        <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Barcode className="w-4 h-4" /> Scan Barcode or Search Product
          </label>
          <div className="relative">
            <input
              ref={scanInputRef}
              type="text"
              autoFocus
              autoComplete="off"
              placeholder="Scan barcode or type product name / SKU…"
              value={scan.value}
              onChange={(e) => scan.onInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  scan.onEnter();
                }
              }}
              className="w-full text-lg px-5 py-4 border-2 border-admin-primary rounded-lg focus:outline-none focus:ring-4 focus:ring-admin-primary-lighter"
            />
            {scan.results.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-admin-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {scan.results.map((p) => (
                  <div
                    key={p.id}
                    className="px-4 py-2.5 cursor-pointer hover:bg-admin-gray-50"
                    onClick={() => scan.selectResult(p)}
                  >
                    {p.name}{" "}
                    <small className="text-admin-gray-400">
                      ({fmt(p.salePrice && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price)}
                      {p.stockQty !== null ? ` · Stock: ${p.stockQty}` : ""})
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
          <h5 className="flex items-center gap-2 font-semibold mb-3">
            <ShoppingBasket className="w-4 h-4 text-admin-primary" /> Cart
          </h5>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-gray-200 text-left text-admin-gray-500">
                  <th className="py-2">Product</th>
                  <th className="py-2">Price</th>
                  <th className="py-2 w-[140px]">Qty</th>
                  <th className="py-2">Subtotal</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-admin-gray-400 py-8">
                      Cart is empty — scan a product to begin.
                    </td>
                  </tr>
                ) : (
                  cart.map((c, idx) => (
                    <tr key={c.productId} className="border-b border-admin-gray-100">
                      <td className="py-2">{c.name}</td>
                      <td className="py-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={c.unitPrice}
                          onChange={(e) => setPrice(idx, e.target.value)}
                          className="w-[90px] border border-admin-gray-200 rounded px-2 py-1"
                        />
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => changeQty(idx, -1)} className="w-7 h-7 border border-admin-gray-200 bg-admin-gray-50 rounded">-</button>
                          <input
                            type="number"
                            min={1}
                            value={c.qty}
                            onChange={(e) => setQty(idx, e.target.value)}
                            className="w-[50px] text-center border border-admin-gray-200 rounded px-1 py-1"
                          />
                          <button type="button" onClick={() => changeQty(idx, 1)} className="w-7 h-7 border border-admin-gray-200 bg-admin-gray-50 rounded">+</button>
                        </div>
                      </td>
                      <td className="py-2">{fmt(c.unitPrice * c.qty)}</td>
                      <td className="py-2">
                        <button type="button" onClick={() => removeFromCart(idx)} className="text-red-600 hover:bg-red-50 p-1.5 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RIGHT: Customer, Coupon, Payment/Totals */}
      <div className="space-y-5">
        <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h5 className="flex items-center gap-2 font-semibold">
              <User className="w-4 h-4 text-admin-primary" /> Customer
            </h5>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="hidden" checked={isGuest} onChange={(e) => toggleGuestBill(e.target.checked)} />
              <span className={cn("w-[34px] h-[18px] rounded-full relative transition-colors", isGuest ? "bg-admin-primary" : "bg-admin-gray-200")}>
                <span className={cn("absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform", isGuest && "translate-x-4")} />
              </span>
              <span className={cn("text-xs font-semibold", isGuest ? "text-admin-primary" : "text-admin-gray-500")}>Guest Bill</span>
            </label>
          </div>

          <div className={cn("relative mb-2", isGuest && "opacity-40 pointer-events-none")}>
            <label className="block text-xs font-medium mb-1">Mobile Number</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Enter mobile number"
              value={customer.phone}
              onChange={(e) => customer.onPhoneChange(e.target.value)}
              onKeyDown={customer.onKeyDown}
              className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
            />
            {customer.results.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-admin-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {customer.results.map((c, i) => (
                  <div
                    key={c.id}
                    className={cn("px-3.5 py-2 cursor-pointer text-sm", i === customer.highlightIndex ? "bg-admin-gray-50" : "hover:bg-admin-gray-50")}
                    onClick={() => customer.selectCustomer(c)}
                  >
                    {c.name} <small className="text-admin-gray-400">({c.phone})</small>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={cn(isGuest && "opacity-40 pointer-events-none")}>
            <label className="block text-xs font-medium mb-1">Customer Name</label>
            <input
              type="text"
              placeholder="Name will appear automatically, or type it"
              value={customer.name}
              onChange={(e) => customer.setName(e.target.value)}
              className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
            />
          </div>

          {customer.matched && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 mt-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> Existing customer selected
            </div>
          )}
          {isGuest && (
            <div className="flex items-center gap-1.5 text-xs text-admin-gray-500 mt-2">
              <Info className="w-3.5 h-3.5" /> No customer details needed — this bill must be paid in full.
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
          <h5 className="flex items-center gap-2 font-semibold mb-3">
            <Tag className="w-4 h-4 text-admin-primary" /> Coupon
          </h5>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              className="flex-1 border border-admin-gray-200 rounded px-3 py-2 text-sm uppercase"
            />
            <button
              type="button"
              onClick={() => applyCoupon(couponCode, allCoupons)}
              className="px-4 py-2 bg-admin-gray-100 hover:bg-admin-gray-200 rounded text-sm font-medium"
            >
              Apply
            </button>
          </div>
          {couponMessage && (
            <div className={cn("text-xs mt-1.5", couponMessage.ok ? "text-emerald-600" : "text-red-600")}>
              {couponMessage.text}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h5 className="flex items-center gap-2 font-semibold">
              <Wallet className="w-4 h-4 text-admin-primary" /> Payment
            </h5>
            <button
              type="button"
              onClick={() => addPaymentRow("Cash", "")}
              className="flex items-center gap-1 text-xs border border-admin-primary text-admin-primary rounded px-2.5 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          <div className="space-y-2 mb-3">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <select
                  value={p.method}
                  onChange={(e) => updatePaymentRow(p.id, { method: e.target.value as typeof p.method })}
                  className="max-w-[110px] shrink-0 border border-admin-gray-200 rounded px-2 py-1.5 text-sm"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="Other">Other</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Amount"
                  value={p.amount}
                  onChange={(e) => updatePaymentRow(p.id, { amount: e.target.value })}
                  className="flex-1 border border-admin-gray-200 rounded px-2 py-1.5 text-sm"
                />
                <button type="button" onClick={() => removePaymentRow(p.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="text-sm space-y-1 py-2">
            <div className="flex justify-between"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>-{fmt(totals.discount)}</span></div>
            <div className="flex justify-between"><span>GST</span><span>+{fmt(totals.gst)}</span></div>
            <div className="flex justify-between text-xl font-extrabold border-t-2 border-admin-gray-800 pt-2 mt-1">
              <span>Total</span><span>{fmt(totals.grandTotal)}</span>
            </div>
          </div>

          <div className="flex justify-between text-sm mt-3 mb-2">
            <span className="text-admin-gray-500">Amount Received</span>
            <span className="font-bold">{fmt(paidTotal)}</span>
          </div>

          {due > 0.004 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg py-2 px-3 mb-3">
              <div className="flex justify-between font-bold text-sm"><span>Due</span><span>{fmt(due)}</span></div>
              <div className="mt-2">
                <label className="block text-xs font-medium mb-1">Promise to pay by (optional)</label>
                <input
                  type="date"
                  value={promisedDate}
                  onChange={(e) => setPromisedDate(e.target.value)}
                  className="w-full border border-admin-gray-200 rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={completeSale}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-admin-primary hover:bg-admin-primary-dark text-white rounded-lg py-3.5 font-semibold text-lg disabled:opacity-60"
          >
            <CheckCircle2 className="w-5 h-5" /> Complete Sale
            <small className="opacity-75 text-sm">({posSettings.shortcutCompleteSale})</small>
          </button>
        </div>
      </div>
    </div>
  );
}
