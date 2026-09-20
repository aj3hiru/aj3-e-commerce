"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import type { CartLine, PaymentRow, PosCoupon, PosProduct } from "@/types/pos";

/** Same effectivePrice(p) logic from billing.php: use sale_price only if it's
 *  a real positive number strictly less than the regular price. */
function effectivePrice(p: PosProduct): number {
  const sale = p.salePrice ?? 0;
  return sale > 0 && sale < p.price ? sale : p.price;
}

let paymentRowId = 0;

export function usePosCart() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<PosCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: String(paymentRowId++), method: "Cash", amount: "0.00" },
  ]);
  const userEditedPayments = useRef(false);

  const addToCart = useCallback((product: PosProduct) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) {
        if (product.productType === "physical" && product.stockQty !== null && existing.qty + 1 > product.stockQty) {
          alert(`Only ${product.stockQty} in stock for "${product.name}".`);
          return prev;
        }
        return prev.map((c) => (c.productId === product.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPrice: effectivePrice(product),
          qty: 1,
          stockQty: product.stockQty,
          productType: product.productType,
          categoryId: product.categoryId,
          subcategoryId: product.subcategoryId,
          gstRate: product.gstRate,
          unit: product.unit,
          sku: product.sku,
          image: product.image ?? null,
        },
      ];
    });
  }, []);

  /**
   * Same as `addToCart`, but for a line that starts at a chosen quantity
   * instead of 1 — used when a quick-added product (one typed in on the
   * spot, not scanned) is entered with its quantity already known, so the
   * cashier isn't left tapping "+" repeatedly right after adding it.
   */
  const addToCartWithQty = useCallback((product: PosProduct, qty: number) => {
    const safeQty = Math.max(1, Math.floor(qty) || 1);
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) {
        return prev.map((c) => (c.productId === product.id ? { ...c, qty: c.qty + safeQty } : c));
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPrice: effectivePrice(product),
          qty: safeQty,
          stockQty: product.stockQty,
          productType: product.productType,
          categoryId: product.categoryId,
          subcategoryId: product.subcategoryId,
          gstRate: product.gstRate,
          unit: product.unit,
          sku: product.sku,
          image: product.image ?? null,
        },
      ];
    });
  }, []);

  const changeQty = useCallback((idx: number, delta: number) => {
    setCart((prev) => {
      const item = prev[idx];
      if (!item) return prev;
      const newQty = item.qty + delta;
      if (newQty < 1) return prev.filter((_, i) => i !== idx);
      if (item.productType === "physical" && item.stockQty !== null && newQty > item.stockQty) {
        alert(`Only ${item.stockQty} in stock.`);
        return prev;
      }
      return prev.map((c, i) => (i === idx ? { ...c, qty: newQty } : c));
    });
  }, []);

  const setQty = useCallback((idx: number, val: string) => {
    setCart((prev) => {
      const item = prev[idx];
      if (!item) return prev;
      let qty = Math.max(1, parseInt(val) || 1);
      if (item.productType === "physical" && item.stockQty !== null && qty > item.stockQty) {
        alert(`Only ${item.stockQty} in stock.`);
        qty = item.stockQty;
      }
      return prev.map((c, i) => (i === idx ? { ...c, qty } : c));
    });
  }, []);

  const setPrice = useCallback((idx: number, val: string) => {
    const price = Math.max(0, parseFloat(val) || 0);
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, unitPrice: price, priceOverridden: true } : c)));
  }, []);

  /** Change the sold-by unit on one cart line (Billing2's editable Unit column). */
  const setUnit = useCallback((idx: number, unit: string) => {
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, unit: unit || null } : c)));
  }, []);

  const removeFromCart = useCallback((idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const applyCoupon = useCallback((code: string, allCoupons: PosCoupon[]) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setAppliedCoupon(null);
      setCouponMessage(null);
      return;
    }
    const found = allCoupons.find((c) => c.code.toUpperCase() === trimmed);
    if (!found) {
      setAppliedCoupon(null);
      setCouponMessage({ text: "Invalid or inactive coupon code.", ok: false });
    } else {
      setAppliedCoupon(found);
      setCouponMessage({ text: `Coupon "${trimmed}" applied!`, ok: true });
    }
  }, []);

  // ── Totals (exactly mirrors recalcTotals() in billing.php) ──
  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, c) => sum + c.unitPrice * c.qty, 0);
    let discount = 0;

    if (appliedCoupon) {
      let eligible = 0;
      for (const c of cart) {
        let matches = false;
        if (appliedCoupon.appliesTo === "all") matches = true;
        else if (appliedCoupon.appliesTo === "product" && c.productId === appliedCoupon.productId) matches = true;
        else if (appliedCoupon.appliesTo === "category" && c.categoryId === appliedCoupon.categoryId) matches = true;
        else if (appliedCoupon.appliesTo === "subcategory" && c.subcategoryId === appliedCoupon.subcategoryId) matches = true;
        if (matches) eligible += c.unitPrice * c.qty;
      }
      if (eligible > 0) {
        discount =
          appliedCoupon.discountType === "percentage"
            ? eligible * (appliedCoupon.discountValue / 100)
            : Math.min(appliedCoupon.discountValue, eligible);
      }
    }

    let gst = 0;
    for (const c of cart) {
      const lineTotal = c.unitPrice * c.qty;
      const discountShare = subtotal > 0 ? discount * (lineTotal / subtotal) : 0;
      const taxable = Math.max(0, lineTotal - discountShare);
      gst += taxable * ((c.gstRate || 0) / 100);
    }

    const grandTotal = Math.max(0, subtotal - discount) + gst;
    return { subtotal, discount, gst, grandTotal };
  }, [cart, appliedCoupon]);

  const paidTotal = useMemo(
    () => payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
    [payments]
  );
  const due = Math.max(0, totals.grandTotal - paidTotal);

  // Auto-fill the single payment row with the bill total, until the user
  // manually edits a payment row (matches the `userEditedPayments` flag in PHP).
  const paymentsAutoFilled = useMemo(() => {
    if (userEditedPayments.current || payments.length !== 1) return payments;
    return [{ ...payments[0], amount: totals.grandTotal.toFixed(2) }];
  }, [payments, totals.grandTotal]);

  const addPaymentRow = useCallback((method: PaymentRow["method"] = "Cash", amount = "") => {
    setPayments((prev) => [...prev, { id: String(paymentRowId++), method, amount }]);
    userEditedPayments.current = true;
  }, []);

  const removePaymentRow = useCallback((id: string) => {
    setPayments((prev) => (prev.length <= 1 ? prev : prev.filter((p) => p.id !== id)));
    userEditedPayments.current = true;
  }, []);

  const updatePaymentRow = useCallback((id: string, patch: Partial<PaymentRow>) => {
    userEditedPayments.current = true;
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const resetForNextSale = useCallback(() => {
    setCart([]);
    setAppliedCoupon(null);
    setCouponMessage(null);
    userEditedPayments.current = false;
    paymentRowId += 1;
    setPayments([{ id: String(paymentRowId), method: "Cash", amount: "0.00" }]);
  }, []);

  return {
    cart,
    addToCart,
    addToCartWithQty,
    changeQty,
    setQty,
    setPrice,
    setUnit,
    removeFromCart,
    appliedCoupon,
    couponMessage,
    applyCoupon,
    totals,
    payments: paymentsAutoFilled,
    paidTotal,
    due,
    addPaymentRow,
    removePaymentRow,
    updatePaymentRow,
    resetForNextSale,
  };
}
