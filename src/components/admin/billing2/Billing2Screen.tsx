"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search, ShoppingCart, Trash2, Tag, CreditCard, PackagePlus, Phone, User, CheckCircle2,
  Info, Lock, ArrowRight, ScanBarcode, Banknote, Smartphone, Wallet, ChevronDown, Plus, Minus, X,
} from "lucide-react";
import { usePosCart } from "@/hooks/usePosCart";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useProductScan } from "@/hooks/useProductScan";
import { QuickAddProductModal } from "./QuickAddProductModal";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
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
 * mockup: barcode search with a search button, a cart with product
 * editable price/qty/unit, coupon + totals pinned at the bottom, and a sticky coral "Payment Summary"
 * column. Customer fields (mobile + name) and the original screen's
 * split-payment rows (Cash + UPI + Card…) live in the payment card.
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
    cart, addToCart, addToCartWithQty, changeQty, setQty, setPrice, setUnit, removeFromCart,
    appliedCoupon, couponMessage, applyCoupon, totals,
    payments, addPaymentRow, removePaymentRow, updatePaymentRow,
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

  // "+ Add" for a split payment. The single row shows the bill total only as
  // an auto-fill until edited; pin that shown amount first so it doesn't
  // snap back to 0 the moment a second row appears.
  function addSplitPayment() {
    if (payments.length === 1) updatePaymentRow(payments[0].id, { amount: payments[0].amount });
    addPaymentRow("UPI", "");
  }

  function toggleGuestBill(checked: boolean) {
    setIsGuest(checked);
    if (checked) customer.reset();
  }

  function printOrder(orderId: number) {
    // A4, thermal or "ask every time" — Business Settings → Invoice Settings decides.
    window.open(`/admin/ecommerce/invoice/${orderId}`, "_blank");
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
            unit: c.unit ?? "",
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

  function handleProductAdded(product: PosProduct, qty: number) {
    setProducts((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
    addToCartWithQty(product, qty);
  }

  // Display Options (header panel). A part shows when its own toggle and its
  // section's toggle are both on; everything is on until the viewer hides it.
  const { isVisible, loaded } = useDashboardWidgetPrefs();

  // Saved Display Options are read from the browser right after the first
  // render. Until then the page stays invisible (but keeps its space), so
  // hidden parts don't flash in and then jump away on every open/refresh.
  // Once shown, put the cursor in the scan box, ready for the scanner.
  useEffect(() => {
    if (loaded) scanInputRef.current?.focus();
  }, [loaded]);
  const inCart = (k: string) => isVisible("b2-cart") && isVisible(k);
  const inFooter = (k: string) => isVisible("b2-footer") && isVisible(k);
  const inSummary = (k: string) => isVisible("b2-summary") && isVisible(k);
  const inCheckout = (k: string) => isVisible("b2-checkout") && isVisible(k);
  const col = {
    product: inCart("b2-col-product"),
    price: inCart("b2-col-price"),
    qty: inCart("b2-col-qty"),
    unit: inCart("b2-col-unit"),
    subtotal: inCart("b2-col-subtotal"),
    action: inCart("b2-col-action"),
  };
  const colCount = Object.values(col).filter(Boolean).length;
  const showCart = isVisible("b2-cart");
  const showCoupon = inFooter("b2-coupon");
  const showTotals = inFooter("b2-totals");
  const showFooter = showCoupon || showTotals;
  const showSumTotal = inSummary("b2-sum-total");
  const showSumReceived = inSummary("b2-sum-received");
  const showSumDue = inSummary("b2-sum-due");
  const showSummaryCard = showSumTotal || showSumReceived || (showSumDue && (due > 0.004 || cart.length > 0));
  const showCustomer = inCheckout("b2-customer");
  const showPayments = inCheckout("b2-payments");

  const gstLabelRate = sameGstRate(cart);
  const itemCountLabel = `${cart.length} item${cart.length === 1 ? "" : "s"}`;

  return (
    <div className={cn("grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px]", !loaded && "invisible")}>
      {/* ─────────────── LEFT: search, cart ─────────────── */}
      <div className="min-w-0 space-y-4">
        {/* Search / scan */}
        {isVisible("b2-scan") && (
        <div className="rounded-xl bg-[#FFF4F0] p-2">
          <div className="relative">
            <div className="flex items-stretch overflow-hidden rounded-lg border border-[#F3B6A6] bg-white focus-within:ring-2 focus-within:ring-[#EE6A4D]/15">
              <ScanBarcode className="ml-3 h-4 w-4 shrink-0 self-center text-admin-gray-700" />
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
                className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm text-admin-gray-900 placeholder:text-admin-gray-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => scan.onEnter()}
                aria-label="Search product"
                className="m-1 flex w-10 shrink-0 items-center justify-center rounded-md text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: CORAL }}
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
            {scan.results.length > 0 && (
              <div className="absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border border-admin-gray-200 bg-white py-1 shadow-lg">
                {scan.results.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#FFF4F0]"
                    onClick={() => scan.selectResult(p)}
                  >
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
        )}

        {/* Cart — fixed-height card on large screens: the item rows scroll,
            while coupon + totals stay pinned at the bottom of the card. */}
        {(showCart || showFooter) && (
        <div className={cn("flex flex-col rounded-xl border border-admin-gray-200 bg-white shadow-sm", showCart && "xl:h-[calc(100dvh-230px)] xl:min-h-[440px]")}>
          {showCart && (<>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4">
            <h5 className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" style={{ color: CORAL }} />
              <span className="font-semibold text-admin-gray-900">Cart</span>
              <span className="text-sm font-normal text-admin-gray-400">({itemCountLabel})</span>
            </h5>
            {isVisible("b2-add-product") && (
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className="flex items-center gap-1 rounded-md border border-[#F3B6A6] bg-[#FFF4F0] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[#FFE9E2]"
              style={{ color: CORAL }}
            >
              <PackagePlus className="h-3.5 w-3.5" /> Add Product
            </button>
            )}
          </div>

          <div className="mx-4 max-h-[55vh] min-h-[150px] flex-1 overflow-auto rounded-lg border border-admin-gray-100 xl:max-h-none">
            <table className={cn("w-full text-sm", colCount >= 4 && "min-w-[620px]")}>
              <thead className="sticky top-0 z-10 bg-admin-gray-50">
                <tr className="text-left text-xs font-medium text-admin-gray-500">
                  {col.product && <th className="py-2 pl-3 font-medium">Product</th>}
                  {col.price && <th className="w-[120px] py-2 pl-3 font-medium">Price</th>}
                  {col.qty && <th className="w-[130px] py-2 pl-3 font-medium">Quantity</th>}
                  {col.unit && <th className="w-[120px] py-2 pl-3 font-medium">Unit</th>}
                  {col.subtotal && <th className="w-[110px] py-2 pr-5 text-right font-medium">Subtotal</th>}
                  {col.action && <th className="w-[64px] py-2 pr-3 text-center font-medium">Action</th>}
                </tr>
              </thead>
              <tbody>
                {colCount === 0 ? (
                  <tr>
                    <td className="py-10 text-center text-sm text-admin-gray-400">
                      All cart columns are hidden — turn them back on from Display Options.
                    </td>
                  </tr>
                ) : cart.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="py-10 text-center text-sm text-admin-gray-400">
                      <ShoppingCart className="mx-auto mb-2 h-7 w-7 text-admin-gray-300" />
                      Cart is empty — scan a product to begin, or use &quot;Add Product&quot; for something not in the list.
                    </td>
                  </tr>
                ) : (
                  cart.map((c, idx) => (
                    <tr key={c.productId} className="border-t border-admin-gray-100 first:border-t-0 hover:bg-admin-gray-50/60">
                      {col.product && (
                      <td className="py-2 pl-3">
                        <div className="max-w-[260px] truncate font-medium text-admin-gray-900" title={c.name}>{c.name}</div>
                      </td>
                      )}
                      {col.price && (
                      <td className="py-2 pl-3">
                        <EditableNumber
                          value={c.unitPrice}
                          decimals={2}
                          min={0}
                          prefix="₹"
                          ariaLabel={`Price of ${c.name}`}
                          onCommit={(v) => setPrice(idx, String(v))}
                          className={cn(c.priceOverridden && "border-[#F3B6A6] bg-[#FFF8F6]")}
                        />
                      </td>
                      )}
                      {col.qty && (
                      <td className="py-2 pl-3">
                        <QtyStepper
                          value={c.qty}
                          name={c.name}
                          onDec={() => changeQty(idx, -1)}
                          onInc={() => changeQty(idx, 1)}
                          onSet={(v) => setQty(idx, String(v))}
                        />
                      </td>
                      )}
                      {col.unit && (
                      <td className="py-2 pl-3">
                        <UnitPicker value={c.unit ?? ""} name={c.name} onChange={(u) => setUnit(idx, u)} />
                      </td>
                      )}
                      {col.subtotal && (
                      <td className="whitespace-nowrap py-2 pl-3 pr-5 text-right font-semibold text-admin-gray-900">
                        {fmt(c.unitPrice * c.qty)}
                      </td>
                      )}
                      {col.action && (
                      <td className="py-2 pr-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeFromCart(idx)}
                          aria-label={`Remove ${c.name}`}
                          className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </>)}

          {/* Coupon + totals — pinned to the bottom of the card */}
          {showFooter && (
          <div className={cn(
            "grid grid-cols-1 gap-3 rounded-b-xl bg-white p-4",
            showCart && "mt-3 border-t border-admin-gray-100",
            showCoupon && showTotals && "md:grid-cols-2"
          )}>
            {showCoupon && (
            <div className="self-start rounded-lg bg-[#FFF6F3] p-3">
              <label htmlFor="b2-coupon" className="mb-2 flex items-center gap-2 text-sm font-semibold text-admin-gray-900">
                <Tag className="h-3.5 w-3.5" style={{ color: CORAL }} /> Coupon Code
              </label>
              <div className="flex gap-2">
                <input
                  id="b2-coupon"
                  type="text"
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCoupon(couponCode, allCoupons);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-admin-gray-200 bg-white px-3 py-1.5 text-sm placeholder:normal-case placeholder:text-admin-gray-400 focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
                />
                <button
                  type="button"
                  onClick={() => applyCoupon(couponCode, allCoupons)}
                  className="rounded-md border border-[#F3B6A6] bg-[#FFF4F0] px-4 text-sm font-semibold transition-colors hover:bg-[#FFE9E2]"
                  style={{ color: CORAL }}
                >
                  Apply
                </button>
              </div>
              {couponMessage && (
                <div className={cn("mt-2 text-xs", couponMessage.ok ? "text-emerald-600" : "text-red-600")}>{couponMessage.text}</div>
              )}
            </div>
            )}

            {showTotals && (
            <div className="rounded-lg bg-admin-gray-50 px-4 py-3">
              <div className="flex gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <div className="flex-1 space-y-1 text-sm">
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
              <div className="mt-2.5 flex items-center justify-between border-t border-admin-gray-200 pt-2.5 pl-[26px]">
                <span className="text-base font-semibold text-admin-gray-900">Total</span>
                <span className="text-lg font-bold text-admin-gray-900">{fmt(totals.grandTotal)}</span>
              </div>
            </div>
            )}
          </div>
          )}
        </div>
        )}
      </div>

      {/* ─────────────── RIGHT: Payment Summary ─────────────── */}
      <aside className="rounded-2xl bg-gradient-to-b from-[#EF7456] via-[#F6B3A2] via-[30%] to-[#FDEFEA] p-2 shadow-[0_8px_24px_-12px_rgba(238,106,77,0.45)] xl:sticky xl:top-4">
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1.5 text-white">
          <h5 className="flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold">
            <CreditCard className="h-4 w-4" /> Payment Summary
          </h5>
          <span className="shrink-0 whitespace-nowrap rounded-md bg-white/85 px-2 py-0.5 text-xs font-medium" style={{ color: CORAL }}>
            {itemCountLabel}
          </span>
        </div>

        {/* Totals card */}
        {showSummaryCard && (
        <div className="mb-2 rounded-xl bg-white p-3.5 shadow-sm">
          {(showSumTotal || showSumReceived) && (
          <div className="divide-y divide-admin-gray-100">
            {showSumTotal && (
            <div className="flex items-center justify-between pb-3">
              <span className="text-sm text-admin-gray-600">Total Amount</span>
              <span className="text-xl font-bold tracking-tight text-admin-gray-900">{fmt(totals.grandTotal)}</span>
            </div>
            )}
            {showSumReceived && (
            <div className={cn("flex items-center justify-between pb-3", showSumTotal && "pt-3")}>
              <span className="text-sm text-admin-gray-600">Amount Received</span>
              <span className="text-base font-semibold text-admin-gray-900">{fmt(paidTotal)}</span>
            </div>
            )}
          </div>
          )}
          {showSumDue && (due > 0.004 ? (
            <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-[#FDECEC] to-[#FFF5F3] px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-red-500">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-red-500 text-[11px] font-bold leading-none text-white">!</span>
                Due Amount
              </span>
              <span className="text-lg font-bold text-red-500">{fmt(due)}</span>
            </div>
          ) : (
            cart.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Fully Paid
                </span>
                <span className="text-lg font-bold text-emerald-600">{fmt(0)}</span>
              </div>
            )
          ))}
        </div>
        )}

        {/* Customer + payment card */}
        <div className="rounded-xl bg-white p-3.5 shadow-sm">
          {/* Customer: mobile + name as one icon-led pair */}
          {showCustomer && (<>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-admin-gray-900">
              <User className="h-4 w-4" style={{ color: CORAL }} /> Customer
            </span>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input type="checkbox" className="sr-only" checked={isGuest} onChange={(e) => toggleGuestBill(e.target.checked)} />
              <span
                className="relative h-[18px] w-8 rounded-full transition-colors"
                style={{ backgroundColor: isGuest ? CORAL : "#E5E7EB" }}
              >
                <span className={cn("absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", isGuest && "translate-x-3.5")} />
              </span>
              <span className="text-xs font-semibold text-admin-gray-500">Guest Bill</span>
            </label>
          </div>

          <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", isGuest && "pointer-events-none opacity-40")}>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-400" />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                aria-label="Mobile number"
                placeholder="Mobile"
                value={customer.phone}
                onChange={(e) => customer.onPhoneChange(e.target.value)}
                onKeyDown={customer.onKeyDown}
                className="w-full rounded-md border border-admin-gray-200 py-2 pl-8 pr-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
              />
              {customer.results.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-64 w-full min-w-[240px] overflow-y-auto rounded-lg border border-admin-gray-200 bg-white py-1 shadow-lg">
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
              <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-400" />
              <input
                type="text"
                aria-label="Customer name"
                placeholder="Name"
                value={customer.name}
                onChange={(e) => customer.setName(e.target.value)}
                className="w-full rounded-md border border-admin-gray-200 py-2 pl-8 pr-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
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

          </>)}

          {showCustomer && showPayments && <div className="my-3.5 border-t border-admin-gray-100" />}

          {/* Payment — split across methods like the original billing screen
              (e.g. part Cash + part UPI). Each row is one method + amount. */}
          {showPayments && (<>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-admin-gray-900">
              <Wallet className="h-4 w-4" style={{ color: CORAL }} /> Payment
            </span>
            <button
              type="button"
              onClick={addSplitPayment}
              className="flex items-center gap-1 rounded-md border border-[#F3B6A6] bg-[#FFF4F0] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[#FFE9E2]"
              style={{ color: CORAL }}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          <div className="space-y-2">
            {payments.map((p, i) => {
              const Icon = METHOD_ICON[p.method] ?? Wallet;
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="relative w-[108px] shrink-0">
                    <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-600" />
                    <select
                      aria-label={`Payment ${i + 1} method`}
                      value={p.method}
                      onChange={(e) => updatePaymentRow(p.id, { method: e.target.value as PaymentRow["method"] })}
                      className="w-full appearance-none rounded-md border border-admin-gray-200 bg-white py-2 pl-8 pr-6 text-sm text-admin-gray-900 focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-500" />
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-admin-gray-500">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="Amount"
                      aria-label={`Payment ${i + 1} amount`}
                      value={p.amount}
                      onChange={(e) => updatePaymentRow(p.id, { amount: e.target.value })}
                      className="w-full rounded-md border border-admin-gray-200 py-2 pl-6 pr-2.5 text-sm text-admin-gray-900 [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removePaymentRow(p.id)}
                    disabled={payments.length <= 1}
                    aria-label={`Remove payment ${i + 1}`}
                    className="shrink-0 rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {due > 0.004 && (
            <div className="mt-3">
              <label htmlFor="b2-promise" className="mb-1 block text-xs text-admin-gray-600">Promise to pay by (optional)</label>
              <input
                id="b2-promise"
                type="date"
                value={promisedDate}
                onChange={(e) => setPromisedDate(e.target.value)}
                className="w-full rounded-md border border-admin-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/20"
              />
            </div>
          )}
          </>)}

          <button
            type="button"
            onClick={completeSale}
            disabled={submitting}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#EE6A4D] to-[#F07E62] py-2.5 text-[15px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(238,106,77,0.7)] transition-opacity hover:opacity-95 disabled:opacity-60",
              (showCustomer || showPayments) && "mt-4"
            )}
          >
            <CreditCard className="h-4 w-4" />
            {submitting ? "Processing…" : "Pay Now"}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>

          {inCheckout("b2-secure-note") && (
          <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-admin-gray-400">
            <Lock className="h-3 w-3" /> Secure &amp; Encrypted Payment
          </div>
          )}
        </div>
      </aside>

      {showQuickAdd && (
        <QuickAddProductModal onClose={() => setShowQuickAdd(false)} onAdded={handleProductAdded} />
      )}
    </div>
  );
}

const UNIT_PRESETS = ["KG", "Gram", "Liter", "ml", "cm", "Meter", "Piece"];

/**
 * Number input that keeps what the cashier is typing (e.g. "12." mid-entry)
 * and reports each valid value upward, so the line subtotal updates live.
 * Snaps back to the stored value on blur if left empty/invalid.
 */
function EditableNumber({
  value, onCommit, decimals, min, prefix, ariaLabel, className,
}: {
  value: number; onCommit: (v: number) => void; decimals: number; min: number;
  prefix?: string; ariaLabel: string; className?: string;
}) {
  const show = (n: number) => (decimals > 0 ? n.toFixed(decimals) : String(n));
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-admin-gray-400">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        step={decimals > 0 ? "0.01" : "1"}
        min={min}
        aria-label={ariaLabel}
        value={text}
        onFocus={(e) => { setFocused(true); e.target.select(); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n) && n >= min) onCommit(n);
        }}
        className={cn(
          "h-8 w-full rounded-md border border-admin-gray-200 bg-white pr-2 text-sm text-admin-gray-900 [appearance:textfield] focus:border-[#EE6A4D] focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/15 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          prefix ? "pl-5" : "pl-2",
          className
        )}
      />
    </div>
  );
}

/** Quantity stepper: − [typed qty] +, one bordered control. */
function QtyStepper({
  value, name, onDec, onInc, onSet,
}: { value: number; name: string; onDec: () => void; onInc: () => void; onSet: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const btn =
    "flex h-full w-8 items-center justify-center text-admin-gray-500 transition-colors hover:bg-[#FFF4F0] hover:text-[#EE6A4D] active:bg-[#FFE9E2]";
  return (
    <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md border border-admin-gray-200 bg-white shadow-sm focus-within:border-[#EE6A4D] focus-within:ring-2 focus-within:ring-[#EE6A4D]/15">
      <button type="button" onClick={onDec} aria-label={`Decrease quantity of ${name}`} className={btn}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        aria-label={`Quantity of ${name}`}
        value={text}
        onFocus={(e) => { setFocused(true); e.target.select(); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n) && n >= 1) onSet(n);
        }}
        className="w-11 border-x border-admin-gray-200 text-center text-sm font-semibold text-admin-gray-900 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={onInc} aria-label={`Increase quantity of ${name}`} className={btn}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Unit per line: preset list, "No unit", or a custom text unit. */
function UnitPicker({ value, name, onChange }: { value: string; name: string; onChange: (u: string) => void }) {
  const isCustomValue = value !== "" && !UNIT_PRESETS.includes(value);
  const [custom, setCustom] = useState(isCustomValue);
  if (custom) {
    return (
      <div className="flex h-8 items-stretch overflow-hidden rounded-md border border-admin-gray-200 bg-white focus-within:border-[#EE6A4D] focus-within:ring-2 focus-within:ring-[#EE6A4D]/15">
        <input
          type="text"
          autoFocus={!isCustomValue}
          maxLength={40}
          placeholder="Unit"
          aria-label={`Custom unit for ${name}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 px-2 text-sm focus:outline-none"
        />
        <button
          type="button"
          onClick={() => { setCustom(false); onChange(""); }}
          aria-label="Back to unit list"
          className="px-1.5 text-admin-gray-400 hover:text-admin-gray-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <select
        aria-label={`Unit for ${name}`}
        value={value}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            setCustom(true);
            onChange("");
          } else onChange(e.target.value);
        }}
        className="h-8 w-full appearance-none rounded-md border border-admin-gray-200 bg-white pl-2 pr-6 text-sm text-admin-gray-900 focus:border-[#EE6A4D] focus:outline-none focus:ring-2 focus:ring-[#EE6A4D]/15"
      >
        <option value="">—</option>
        {UNIT_PRESETS.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
        <option value="__custom">Custom…</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-400" />
    </div>
  );
}

/** Shared GST rate when every cart line has the same rate, else null — so the
 *  "GST (18%)" label never misstates a mixed-rate cart. */
function sameGstRate(cart: { gstRate: number }[]): number | null {
  if (cart.length === 0) return null;
  const first = cart[0].gstRate;
  return cart.every((c) => c.gstRate === first) ? first : null;
}
