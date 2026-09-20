"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search, ShoppingCart, Trash2, Tag, CreditCard, PackagePlus, Phone, User, CheckCircle2,
  Info, Lock, ArrowRight, ScanBarcode, Banknote, Smartphone, Wallet, ChevronDown, Package,
} from "lucide-react";
import { usePosCart } from "@/hooks/usePosCart";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useProductScan } from "@/hooks/useProductScan";
import { QuickAddProductModal } from "./QuickAddProductModal";
import type { PosProduct, PosCoupon, PosCustomer, BusinessPosSettings, PaymentRow } from "@/types/pos";
import { cn } from "@/lib/utils";

/** ₹1,934.30 — Indian digit grouping, always two decimals, like the mockup. */
const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Billing2ScreenProps {
  allProducts: PosProduct[];
  allCoupons: PosCoupon[];
  allCustomers: PosCustomer[];
  posSettings: BusinessPosSettings;
  preselectedCustomer?: PosCustomer | null;
}

const PAYMENT_METHODS: PaymentRow["method"][] = ["Cash", "Card", "UPI", "Other"];
const METHOD_ICON = { Cash: Banknote, Card: CreditCard, UPI: Smartphone, Other: Wallet } as const;

/** The mockup's coral accent, used only inside this page (header/sidebar keep the site theme). */
const CORAL = "#EE6A4D";

/**
 * /admin/ecommerce/billing2 — same POS logic as PosBillingScreen (same hooks,
 * same checkout API, same business rules), laid out to match the Billing2
 * mockup: step bar, barcode search with a search button, a cart with product
 * thumbnails, coupon + totals boxes, and a sticky coral "Payment Summary"
 * column. Customer fields (mobile + name) live at the top of the payment
 * card, since checkout needs them for due bills.
 */
export function Billing2Screen({
  allProducts,
  allCoupons,
  allCustomers,
  posSettings,
  preselectedCustomer,
}: Billing2ScreenProps) {
  // Products created via "Add Product" mid-sale are appended here so a second
  // scan/search in the same sale finds them too, without a page reload.
  const [products, setProducts] = useState(allProducts);

  const {
    cart, addToCart, addToCartWithQty, changeQty, setQty, removeFromCart,
    appliedCoupon, couponMessage, applyCoupon, totals,
    payments, updatePaymentRow,
    resetForNextSale,
  } = usePosCart();

  // Received/due are computed from `payments` exactly as it will be submitted
  // (the hook auto-fills the single row with the bill total until the cashier
  // edits it), so the summary never shows a due amount that isn't real.
  const paidTotal = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const due = Math.max(0, totals.grandTotal - paidTotal);

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

  // One payment row (method + amount received) on screen, matching the
  // mockup — usePosCart's payment list is still what's submitted underneath.
  const payment = payments[0];
  const MethodIcon = METHOD_ICON[payment.method] ?? Wallet;

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

  // Step bar is a status readout (every section stays on the page): it
  // highlights where the cashier actually is in the flow.
  const step: 1 | 2 | 3 = cart.length === 0 ? 1 : !isGuest && !customer.customerId && !customer.name.trim() ? 2 : 3;

  function handleProductAdded(product: PosProduct, qty: number) {
    setProducts((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
    addToCartWithQty(product, qty);
  }

  const gstLabelRate = sameGstRate(cart);
  const itemCountLabel = `${cart.length} item${cart.length === 1 ? "" : "s"}`;

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* ─────────────── LEFT: steps, search, cart ─────────────── */}
      <div className="min-w-0 space-y-5">
        {/* Step bar */}
        <div className="rounded-2xl border border-admin-gray-200 bg-white p-2 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:gap-0">
            <StepSegment n={1} title="Add items" subtitle="Scan or search products" active={step === 1} done={step > 1} first />
            <StepSegment n={2} title="Customer" subtitle="Enter customer details" active={step === 2} done={step > 2} />
            <StepSegment n={3} title="Payment" subtitle="Choose method and complete" active={step === 3} done={false} last />
          </div>
        </div>

        {/* Search / scan */}
        <div className="rounded-2xl bg-[#FFF4F0] p-3">
          <div className="relative">
            <div className="flex items-stretch overflow-hidden rounded-xl border border-[#F3B6A6] bg-white focus-within:ring-4 focus-within:ring-[#EE6A4D]/15">
              <ScanBarcode className="ml-4 h-5 w-5 shrink-0 self-center text-admin-gray-700" />
              <input
                ref={scanInputRef}
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="Scan barcode or type product name / SKU..."
                value={scan.value}
                onChange={(e) => scan.onInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    scan.onEnter();
                  }
                }}
                className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-[15px] text-admin-gray-900 placeholder:text-admin-gray-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => scan.onEnter()}
                aria-label="Search product"
                className="m-1 flex w-14 shrink-0 items-center justify-center rounded-lg text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: CORAL }}
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
            {scan.results.length > 0 && (
              <div className="absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-admin-gray-200 bg-white py-1 shadow-lg">
                {scan.results.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#FFF4F0]"
                    onClick={() => scan.selectResult(p)}
                  >
                    <Thumb image={p.image} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-admin-gray-900">{p.name}</span>
                      <span className="block truncate text-xs text-admin-gray-400">
                        {p.sku ? `SKU: ${p.sku}` : "No SKU"}
                        {p.unit ? ` · ${p.unit}` : ""}
                        {p.stockQty !== null ? ` · Stock: ${p.stockQty}` : ""}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-admin-gray-800">
                      {fmt(p.salePrice && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="rounded-2xl border border-admin-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h5 className="flex items-center gap-2.5 text-lg">
              <ShoppingCart className="h-5 w-5" style={{ color: CORAL }} />
              <span className="font-semibold text-admin-gray-900">Cart</span>
              <span className="font-normal text-admin-gray-400">({itemCountLabel})</span>
            </h5>
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[#F3B6A6] bg-[#FFF4F0] px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-[#FFE9E2]"
              style={{ color: CORAL }}
            >
              <PackagePlus className="h-4 w-4" /> Add Product
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-admin-gray-50 text-left text-[13px] font-medium text-admin-gray-500">
                  <th className="w-12 rounded-l-lg py-3 pl-4 font-medium">#</th>
                  <th className="py-3 font-medium">Product</th>
                  <th className="py-3 font-medium">Price</th>
                  <th className="py-3 font-medium">Qty</th>
                  <th className="py-3 font-medium">Subtotal</th>
                  <th className="rounded-r-lg py-3 pr-4 text-center font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-admin-gray-400">
                      <ShoppingCart className="mx-auto mb-2 h-8 w-8 text-admin-gray-300" />
                      Cart is empty — scan a product to begin, or use &quot;Add Product&quot; for something not in the list.
                    </td>
                  </tr>
                ) : (
                  cart.map((c, idx) => (
                    <tr key={c.productId} className="border-b border-admin-gray-100 last:border-b-0">
                      <td className="py-4 pl-4 text-admin-gray-700">{idx + 1}</td>
                      <td className="py-4">
                        <div className="flex items-center gap-4">
                          <Thumb image={c.image} />
                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-medium text-admin-gray-900">{c.name}</div>
                            <div className="mt-0.5 truncate text-[13px] text-admin-gray-500">
                              {c.sku ? `SKU: ${c.sku}` : "SKU: —"}
                              {c.unit ? ` · Unit: ${c.unit}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-4 text-[15px] text-admin-gray-800">{fmt(c.unitPrice)}</td>
                      <td className="py-4">
                        <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-admin-gray-200 bg-admin-gray-50">
                          <button
                            type="button"
                            onClick={() => changeQty(idx, -1)}
                            aria-label="Decrease quantity"
                            className="w-9 text-admin-gray-600 hover:bg-admin-gray-100"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={c.qty}
                            onChange={(e) => setQty(idx, e.target.value)}
                            aria-label="Quantity"
                            className="w-11 border-x border-admin-gray-200 bg-white py-1.5 text-center text-[15px] [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => changeQty(idx, 1)}
                            aria-label="Increase quantity"
                            className="w-9 text-admin-gray-600 hover:bg-admin-gray-100"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-4 text-[15px] text-admin-gray-800">{fmt(c.unitPrice * c.qty)}</td>
                      <td className="py-4 pr-4 text-center">
                        <button
                          type="button"
                          onClick={() => removeFromCart(idx)}
                          aria-label={`Remove ${c.name}`}
                          className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Coupon + totals */}
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="self-start rounded-xl bg-[#FFF6F3] p-4">
              <label htmlFor="b2-coupon" className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-admin-gray-900">
                <Tag className="h-4 w-4" style={{ color: CORAL }} /> Coupon Code
              </label>
              <div className="flex gap-3">
                <input
                  id="b2-coupon"
                  type="text"
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="min-w-0 flex-1 rounded-lg border border-admin-gray-200 bg-white px-4 py-2.5 text-sm placeholder:normal-case placeholder:text-admin-gray-400 focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
                />
                <button
                  type="button"
                  onClick={() => applyCoupon(couponCode, allCoupons)}
                  className="rounded-lg border border-[#F3B6A6] bg-[#FFF4F0] px-6 text-sm font-semibold transition-colors hover:bg-[#FFE9E2]"
                  style={{ color: CORAL }}
                >
                  Apply
                </button>
              </div>
              {couponMessage && (
                <div className={cn("mt-2 text-xs", couponMessage.ok ? "text-emerald-600" : "text-red-600")}>{couponMessage.text}</div>
              )}
            </div>

            <div className="rounded-xl bg-admin-gray-50 px-5 py-4">
              <div className="flex gap-3">
                <Info className="mt-0.5 h-[18px] w-[18px] shrink-0 text-sky-600" />
                <div className="flex-1 space-y-2 text-[15px]">
                  <div className="flex justify-between text-admin-gray-500">
                    <span>Subtotal</span><span className="text-admin-gray-800">{fmt(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-admin-gray-500">
                    <span>Discount</span><span className="text-red-500">-{fmt(totals.discount)}</span>
                  </div>
                  <div className="flex justify-between text-admin-gray-500">
                    <span>GST{gstLabelRate !== null ? ` (${gstLabelRate}%)` : ""}</span>
                    <span className="text-admin-gray-800">+{fmt(totals.gst)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-admin-gray-200 pt-4 pl-[30px]">
                <span className="text-xl font-bold text-admin-gray-900">Total</span>
                <span className="text-2xl font-bold text-admin-gray-900">{fmt(totals.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────── RIGHT: Payment Summary ─────────────── */}
      <aside className="rounded-3xl bg-gradient-to-b from-[#EF7456] via-[#F6B3A2] via-[35%] to-[#FDEFEA] p-3 shadow-[0_10px_30px_-12px_rgba(238,106,77,0.45)] xl:sticky xl:top-4">
        <div className="flex items-center justify-between gap-3 px-3 pb-4 pt-3 text-white">
          <h5 className="flex items-center gap-2.5 whitespace-nowrap text-lg font-semibold sm:gap-3 sm:text-xl">
            <CreditCard className="h-6 w-6" /> Payment Summary
          </h5>
          <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/85 px-3 py-1 text-sm font-medium" style={{ color: CORAL }}>
            {itemCountLabel}
          </span>
        </div>

        {/* Totals card */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-admin-gray-100 pb-5">
            <span className="text-[15px] text-admin-gray-800">Total Amount</span>
            <span className="text-3xl font-bold tracking-tight text-admin-gray-900">{fmt(totals.grandTotal)}</span>
          </div>
          <div className="flex items-center justify-between py-5">
            <span className="text-[15px] text-admin-gray-800">Amount Received</span>
            <span className="text-2xl font-bold text-admin-gray-900">{fmt(paidTotal)}</span>
          </div>
          {due > 0.004 ? (
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[#FDECEC] to-[#FFF5F3] px-4 py-4">
              <span className="flex items-center gap-2.5 text-[15px] font-semibold text-red-500">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-sm font-bold leading-none text-white">!</span>
                Due Amount
              </span>
              <span className="text-2xl font-bold text-red-500">{fmt(due)}</span>
            </div>
          ) : (
            cart.length > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-4">
                <span className="flex items-center gap-2.5 text-[15px] font-semibold text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" /> Fully Paid
                </span>
                <span className="text-2xl font-bold text-emerald-600">{fmt(0)}</span>
              </div>
            )
          )}
        </div>

        {/* Customer + payment card */}
        <div className="mt-3 rounded-2xl bg-white p-5 shadow-sm">
          {/* Customer: mobile + name as one icon-led pair */}
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2.5 text-[15px] font-semibold text-admin-gray-900">
              <User className="h-[18px] w-[18px]" style={{ color: CORAL }} /> Customer
            </span>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input type="checkbox" className="sr-only" checked={isGuest} onChange={(e) => toggleGuestBill(e.target.checked)} />
              <span
                className="relative h-5 w-9 rounded-full transition-colors"
                style={{ backgroundColor: isGuest ? CORAL : "#E5E7EB" }}
              >
                <span className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", isGuest && "translate-x-4")} />
              </span>
              <span className="text-xs font-semibold text-admin-gray-500">Guest Bill</span>
            </label>
          </div>

          <div className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-2", isGuest && "pointer-events-none opacity-40")}>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Mobile number"
                placeholder="Mobile number"
                value={customer.phone}
                onChange={(e) => customer.onPhoneChange(e.target.value)}
                onKeyDown={customer.onKeyDown}
                className="w-full rounded-xl border border-admin-gray-200 py-3 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
              />
              {customer.results.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-64 w-full min-w-[240px] overflow-y-auto rounded-xl border border-admin-gray-200 bg-white py-1 shadow-lg">
                  {customer.results.map((c, i) => (
                    <button
                      type="button"
                      key={c.id}
                      className={cn("block w-full px-3.5 py-2 text-left text-sm", i === customer.highlightIndex ? "bg-[#FFF4F0]" : "hover:bg-[#FFF4F0]")}
                      onClick={() => customer.selectCustomer(c)}
                    >
                      {c.name} <small className="text-admin-gray-400">({c.phone})</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
              <input
                type="text"
                aria-label="Customer name"
                placeholder="Customer name"
                value={customer.name}
                onChange={(e) => customer.setName(e.target.value)}
                className="w-full rounded-xl border border-admin-gray-200 py-3 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
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

          <div className="my-5 border-t border-admin-gray-100" />

          {/* Payment method */}
          <label htmlFor="b2-method" className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-admin-gray-900">
            <CreditCard className="h-[18px] w-[18px]" style={{ color: CORAL }} /> Payment Method
          </label>
          <div className="relative">
            <MethodIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-admin-gray-700" />
            <select
              id="b2-method"
              value={payment.method}
              onChange={(e) => updatePaymentRow(payment.id, { method: e.target.value as PaymentRow["method"] })}
              className="w-full appearance-none rounded-xl border border-admin-gray-200 bg-white py-3.5 pl-12 pr-10 text-[15px] text-admin-gray-900 focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-700" />
          </div>

          <div className="my-5 border-t border-admin-gray-100" />

          <label htmlFor="b2-received" className="mb-2 block text-[15px] text-admin-gray-800">Amount Received</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-admin-gray-900">₹</span>
            <input
              id="b2-received"
              type="number"
              step="0.01"
              min={0}
              value={payment.amount}
              onChange={(e) => updatePaymentRow(payment.id, { amount: e.target.value })}
              className="w-full rounded-xl border border-admin-gray-200 py-3.5 pl-8 pr-4 text-[15px] text-admin-gray-900 [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>

          {due > 0.004 && (
            <div className="mt-4">
              <label htmlFor="b2-promise" className="mb-2 block text-sm text-admin-gray-600">Promise to pay by (optional)</label>
              <input
                id="b2-promise"
                type="date"
                value={promisedDate}
                onChange={(e) => setPromisedDate(e.target.value)}
                className="w-full rounded-xl border border-admin-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
              />
            </div>
          )}

          <button
            type="button"
            onClick={completeSale}
            disabled={submitting}
            className="mt-10 flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#EE6A4D] to-[#F07E62] py-4 text-lg font-semibold text-white shadow-[0_8px_20px_-8px_rgba(238,106,77,0.7)] transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            <CreditCard className="h-6 w-6" />
            {submitting ? "Processing…" : "Pay Now"}
            {!submitting && <ArrowRight className="h-5 w-5" />}
          </button>

          <div className="mt-5 flex items-center justify-center gap-2 text-[13px] text-admin-gray-400">
            <Lock className="h-3.5 w-3.5" /> Secure &amp; Encrypted Payment
          </div>
        </div>
      </aside>

      {showQuickAdd && (
        <QuickAddProductModal onClose={() => setShowQuickAdd(false)} onAdded={handleProductAdded} />
      )}
    </div>
  );
}

/**
 * One step of the step bar. On md+ each segment is an arrow shape
 * (clip-path chevron) so the three read as a flow, like the mockup.
 */
function StepSegment({
  n, title, subtitle, active, done, first, last,
}: { n: number; title: string; subtitle: string; active: boolean; done: boolean; first?: boolean; last?: boolean }) {
  const clip = first
    ? "md:[clip-path:polygon(0_0,calc(100%-18px)_0,100%_50%,calc(100%-18px)_100%,0_100%)]"
    : last
    ? "md:[clip-path:polygon(0_0,100%_0,100%_100%,0_100%,18px_50%)]"
    : "md:[clip-path:polygon(0_0,calc(100%-18px)_0,100%_50%,calc(100%-18px)_100%,0_100%,18px_50%)]";
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-4 rounded-xl px-5 py-3.5 md:rounded-none",
        first ? "md:rounded-l-xl" : "md:-ml-2 md:pl-9",
        last && "md:rounded-r-xl",
        clip,
        active ? "bg-[#FFEFEA]" : "bg-admin-gray-50"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-semibold",
          active ? "text-white" : done ? "bg-emerald-500 text-white" : "bg-admin-gray-200 text-admin-gray-700"
        )}
        style={active ? { backgroundColor: CORAL } : undefined}
      >
        {done ? <CheckCircle2 className="h-5 w-5" /> : n}
      </span>
      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-admin-gray-900">{title}</div>
        <div className="truncate text-[13px] text-admin-gray-500">{subtitle}</div>
      </div>
    </div>
  );
}

/** Product thumbnail with a neutral placeholder when the product has no image. */
function Thumb({ image, size = "md" }: { image?: string | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-9 w-9" : "h-14 w-14";
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/${image}`} alt="" className={cn(box, "shrink-0 rounded-lg border border-admin-gray-100 object-cover")} />;
  }
  return (
    <span className={cn(box, "flex shrink-0 items-center justify-center rounded-lg border border-admin-gray-100 bg-admin-gray-50 text-admin-gray-300")}>
      <Package className={size === "sm" ? "h-4 w-4" : "h-6 w-6"} />
    </span>
  );
}

/** Shared GST rate when every cart line has the same rate, else null — so the
 *  "GST (18%)" label never misstates a mixed-rate cart. */
function sameGstRate(cart: { gstRate: number }[]): number | null {
  if (cart.length === 0) return null;
  const first = cart[0].gstRate;
  return cart.every((c) => c.gstRate === first) ? first : null;
}
