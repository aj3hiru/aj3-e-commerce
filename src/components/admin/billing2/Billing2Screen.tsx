"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search, ShoppingCart, Trash2, Tag, CreditCard, AlertCircle, PackagePlus,
  Phone, User, CheckCircle2, Info, ShieldCheck, ArrowRight,
} from "lucide-react";
import { usePosCart } from "@/hooks/usePosCart";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useProductScan } from "@/hooks/useProductScan";
import { QuickAddProductModal } from "./QuickAddProductModal";
import type { PosProduct, PosCoupon, PosCustomer, BusinessPosSettings, PaymentRow } from "@/types/pos";
import { cn } from "@/lib/utils";

const fmt = (n: number) => `₹${n.toFixed(2)}`;

interface Billing2ScreenProps {
  allProducts: PosProduct[];
  allCoupons: PosCoupon[];
  allCustomers: PosCustomer[];
  posSettings: BusinessPosSettings;
  preselectedCustomer?: PosCustomer | null;
}

const PAYMENT_METHODS: PaymentRow["method"][] = ["Cash", "Card", "UPI", "Other"];

/**
 * /admin/ecommerce/billing2 — same POS logic as PosBillingScreen (same hooks,
 * same checkout API, same business rules), presented as the new mockup's
 * layout: a step strip, a big search bar, a cart with a per-line unit, one
 * payment-method + amount-received pair instead of a multi-row split-payment
 * list, and a quick-add for a product that isn't in the catalog yet.
 */
export function Billing2Screen({
  allProducts,
  allCoupons,
  allCustomers,
  posSettings,
  preselectedCustomer,
}: Billing2ScreenProps) {
  // Products created via "Add New Product" mid-sale are appended here so a
  // second scan/search in the same sale finds them too, without a page reload.
  const [products, setProducts] = useState(allProducts);

  const {
    cart, addToCart, addToCartWithQty, changeQty, setQty, removeFromCart,
    appliedCoupon, couponMessage, applyCoupon, totals,
    payments, updatePaymentRow, due, paidTotal,
    resetForNextSale,
  } = usePosCart();

  const scan = useProductScan(products, addToCart);
  const customer = useCustomerSearch(allCustomers);

  const [isGuest, setIsGuest] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (preselectedCustomer) customer.preselect(preselectedCustomer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedCustomer]);

  // The screen only ever shows one payment row (method + amount received),
  // matching the mockup — usePosCart's split-payment list is still what's
  // submitted underneath, just always with exactly one row here.
  const payment = payments[0];

  function toggleGuestBill(checked: boolean) {
    setIsGuest(checked);
    if (checked) customer.reset();
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

  // Step strip: purely a status readout (not clickable navigation, and every
  // section stays on-page below it) — highlights wherever the cashier
  // actually is in the flow, instead of always pointing at step 1.
  const step: 1 | 2 | 3 = cart.length === 0 ? 1 : !isGuest && !customer.customerId && !customer.name.trim() ? 2 : 3;

  function handleProductAdded(product: PosProduct, qty: number) {
    setProducts((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
    addToCartWithQty(product, qty);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
      {/* Step strip */}
      <div className="lg:col-span-2">
        <div className="flex flex-col gap-2 rounded-lg border border-admin-gray-200 bg-white p-3 sm:flex-row sm:items-stretch sm:gap-3 sm:p-4">
          <StepChip n={1} title="Add items" subtitle="Scan or search products" active={step === 1} done={step > 1} />
          <StepChip n={2} title="Customer" subtitle="Enter customer details" active={step === 2} done={step > 2} />
          <StepChip n={3} title="Payment" subtitle="Choose method and complete" active={step === 3} done={false} />
        </div>
      </div>

      {/* LEFT: Scan + Cart */}
      <div className="space-y-5">
        <div className="rounded-lg border border-admin-gray-200 bg-white p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
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
              className="w-full rounded-lg border-2 border-admin-primary py-3.5 pl-11 pr-4 text-base focus:outline-none focus:ring-4 focus:ring-admin-primary-lighter"
            />
            {scan.results.length > 0 && (
              <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-admin-gray-200 bg-white shadow-lg">
                {scan.results.map((p) => (
                  <div key={p.id} className="cursor-pointer px-4 py-2.5 hover:bg-admin-gray-50" onClick={() => scan.selectResult(p)}>
                    {p.name}{" "}
                    <small className="text-admin-gray-400">
                      ({fmt(p.salePrice && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price)}
                      {p.unit ? ` · ${p.unit}` : ""}
                      {p.stockQty !== null ? ` · Stock: ${p.stockQty}` : ""})
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-admin-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h5 className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="h-4 w-4 text-admin-primary" /> Cart ({cart.length} item{cart.length === 1 ? "" : "s"})
            </h5>
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className="flex items-center gap-1.5 rounded border border-admin-primary px-3 py-1.5 text-xs font-semibold text-admin-primary hover:bg-admin-primary-lighter"
            >
              <PackagePlus className="h-3.5 w-3.5" /> Add Product
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-admin-gray-200 text-left text-admin-gray-500">
                  <th className="w-8 py-2">#</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Price</th>
                  <th className="w-[150px] py-2">Qty</th>
                  <th className="py-2">Subtotal</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-admin-gray-400">
                      Cart is empty — scan a product to begin, or use &quot;Add Product&quot; for something not in the list.
                    </td>
                  </tr>
                ) : (
                  cart.map((c, idx) => (
                    <tr key={c.productId} className="border-b border-admin-gray-100">
                      <td className="py-2 text-admin-gray-400">{idx + 1}</td>
                      <td className="py-2">
                        <div className="font-medium text-admin-gray-900">{c.name}</div>
                        {c.unit && <div className="text-xs text-admin-gray-400">Unit: {c.unit}</div>}
                      </td>
                      <td className="py-2 whitespace-nowrap">{fmt(c.unitPrice)}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => changeQty(idx, -1)} className="h-7 w-7 rounded border border-admin-gray-200 bg-admin-gray-50">−</button>
                          <input
                            type="number"
                            min={1}
                            value={c.qty}
                            onChange={(e) => setQty(idx, e.target.value)}
                            className="w-[50px] rounded border border-admin-gray-200 px-1 py-1 text-center"
                          />
                          <button type="button" onClick={() => changeQty(idx, 1)} className="h-7 w-7 rounded border border-admin-gray-200 bg-admin-gray-50">+</button>
                          {c.unit && <span className="text-xs font-medium text-admin-gray-400">{c.unit}</span>}
                        </div>
                      </td>
                      <td className="py-2 whitespace-nowrap font-semibold">{fmt(c.unitPrice * c.qty)}</td>
                      <td className="py-2">
                        <button type="button" onClick={() => removeFromCart(idx)} className="rounded p-1.5 text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Coupon code + totals footer, matching the mockup's two-column split */}
          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-admin-gray-100 pt-4 sm:grid-cols-2">
            <div className="rounded-lg bg-admin-gray-50 p-3">
              <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-admin-gray-700">
                <Tag className="h-3.5 w-3.5 text-admin-primary" /> Coupon Code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="flex-1 rounded border border-admin-gray-200 bg-white px-3 py-2 text-sm uppercase"
                />
                <button
                  type="button"
                  onClick={() => applyCoupon(couponCode, allCoupons)}
                  className="rounded bg-admin-gray-200 px-4 py-2 text-sm font-medium hover:bg-admin-gray-300"
                >
                  Apply
                </button>
              </div>
              {couponMessage && (
                <div className={cn("mt-1.5 text-xs", couponMessage.ok ? "text-emerald-600" : "text-red-600")}>{couponMessage.text}</div>
              )}
            </div>

            <div className="space-y-1 text-sm">
              <Row label="Subtotal" value={fmt(totals.subtotal)} />
              <Row label="Discount" value={`-${fmt(totals.discount)}`} valueClass="text-red-600" />
              <Row label={`GST${sameGstRate(cart) !== null ? ` (${sameGstRate(cart)}%)` : ""}`} value={`+${fmt(totals.gst)}`} />
              <div className="mt-1 flex justify-between border-t-2 border-admin-gray-800 pt-2 text-lg font-extrabold">
                <span>Total</span><span>{fmt(totals.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Customer + Payment Summary */}
      <div className="space-y-5">
        {/* Customer — mobile number and name treated as one compact unit, each
            marked with an icon instead of a wordy label, so the pair reads
            clearly at any width instead of two separate stacked form fields. */}
        <div className="rounded-lg border border-admin-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h5 className="flex items-center gap-2 font-semibold">
              <User className="h-4 w-4 text-admin-primary" /> Customer
            </h5>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input type="checkbox" className="hidden" checked={isGuest} onChange={(e) => toggleGuestBill(e.target.checked)} />
              <span className={cn("relative h-[18px] w-[34px] rounded-full transition-colors", isGuest ? "bg-admin-primary" : "bg-admin-gray-200")}>
                <span className={cn("absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform", isGuest && "translate-x-4")} />
              </span>
              <span className={cn("text-xs font-semibold", isGuest ? "text-admin-primary" : "text-admin-gray-500")}>Guest Bill</span>
            </label>
          </div>

          <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", isGuest && "pointer-events-none opacity-40")}>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-400" />
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Mobile number"
                placeholder="Mobile number"
                value={customer.phone}
                onChange={(e) => customer.onPhoneChange(e.target.value)}
                onKeyDown={customer.onKeyDown}
                className="w-full rounded border border-admin-gray-200 py-2 pl-8 pr-3 text-sm"
              />
              {customer.results.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-admin-gray-200 bg-white shadow-lg sm:w-[220%]">
                  {customer.results.map((c, i) => (
                    <div
                      key={c.id}
                      className={cn("cursor-pointer px-3.5 py-2 text-sm", i === customer.highlightIndex ? "bg-admin-gray-50" : "hover:bg-admin-gray-50")}
                      onClick={() => customer.selectCustomer(c)}
                    >
                      {c.name} <small className="text-admin-gray-400">({c.phone})</small>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-400" />
              <input
                type="text"
                aria-label="Customer name"
                placeholder="Customer name"
                value={customer.name}
                onChange={(e) => customer.setName(e.target.value)}
                className="w-full rounded border border-admin-gray-200 py-2 pl-8 pr-3 text-sm"
              />
            </div>
          </div>

          {customer.matched && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Existing customer selected
            </div>
          )}
          {isGuest && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-admin-gray-500">
              <Info className="h-3.5 w-3.5" /> No customer details needed — this bill must be paid in full.
            </div>
          )}
        </div>

        {/* Payment Summary */}
        <div className="overflow-hidden rounded-lg border border-admin-gray-200 bg-white">
          <div className="flex items-center justify-between bg-gradient-to-r from-orange-500 to-orange-400 px-5 py-3.5 text-white">
            <h5 className="flex items-center gap-2 font-semibold">
              <CreditCard className="h-4 w-4" /> Payment Summary
            </h5>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
              {cart.length} item{cart.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="space-y-3 p-5">
            <Row label="Total Amount" value={fmt(totals.grandTotal)} big />
            <Row label="Amount Received" value={fmt(paidTotal)} />

            {due > 0.004 && (
              <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                  <AlertCircle className="h-4 w-4" /> Due Amount
                </span>
                <span className="text-lg font-bold text-red-700">{fmt(due)}</span>
              </div>
            )}

            {due > 0.004 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-admin-gray-600">Promise to pay by (optional)</label>
                <input
                  type="date"
                  value={promisedDate}
                  onChange={(e) => setPromisedDate(e.target.value)}
                  className="w-full rounded border border-admin-gray-200 px-2.5 py-1.5 text-sm"
                />
              </div>
            )}

            <div className="border-t border-admin-gray-100 pt-3">
              <label className="mb-1 block text-xs font-medium text-admin-gray-600">Payment Method</label>
              <select
                value={payment.method}
                onChange={(e) => updatePaymentRow(payment.id, { method: e.target.value as PaymentRow["method"] })}
                className="w-full rounded border border-admin-gray-200 px-3 py-2 text-sm"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-admin-gray-600">Amount Received</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={payment.amount}
                onChange={(e) => updatePaymentRow(payment.id, { amount: e.target.value })}
                className="w-full rounded border border-admin-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={completeSale}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-400 py-3.5 text-base font-semibold text-white disabled:opacity-60"
            >
              Pay Now <ArrowRight className="h-4 w-4" />
            </button>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-admin-gray-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Secure &amp; Encrypted Payment
            </div>
          </div>
        </div>
      </div>

      {showQuickAdd && (
        <QuickAddProductModal onClose={() => setShowQuickAdd(false)} onAdded={handleProductAdded} />
      )}
    </div>
  );
}

function StepChip({ n, title, subtitle, active, done }: { n: number; title: string; subtitle: string; active: boolean; done: boolean }) {
  return (
    <div className={cn("flex flex-1 items-center gap-3 rounded-lg border px-4 py-3 transition-colors", active ? "border-orange-200 bg-orange-50" : "border-transparent")}>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          active ? "bg-orange-500 text-white" : done ? "bg-emerald-500 text-white" : "bg-admin-gray-200 text-admin-gray-500"
        )}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0">
        <div className={cn("truncate text-sm font-semibold", active ? "text-admin-gray-900" : "text-admin-gray-700")}>{title}</div>
        <div className="truncate text-xs text-admin-gray-400">{subtitle}</div>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass, big }: { label: string; value: string; valueClass?: string; big?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", big ? "text-base" : "text-sm")}>
      <span className="text-admin-gray-500">{label}</span>
      <span className={cn(big ? "text-xl font-extrabold text-admin-gray-900" : "font-semibold text-admin-gray-800", valueClass)}>{value}</span>
    </div>
  );
}

/** Returns the shared GST rate as a plain number when every cart line has the
 *  same rate (the common case for a single-tax-bracket shop), so the "GST"
 *  row can label itself "GST (18%)" like the mockup — otherwise null, since
 *  a single percentage would misrepresent a mixed-rate cart. */
function sameGstRate(cart: { gstRate: number }[]): number | null {
  if (cart.length === 0) return null;
  const first = cart[0].gstRate;
  return cart.every((c) => c.gstRate === first) ? first : null;
}
