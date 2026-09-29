"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import type { CartLine, PaymentRow, PosCoupon, PosProduct } from "@/types/pos";
import { packLabel } from "@/lib/product-variants-shared";
import { itemsTotal, lineTax } from "@/lib/tax-mode-shared";

/** Same effectivePrice(p) logic from billing.php: use sale_price only if it's
 *  a real positive number strictly less than the regular price. */
function effectivePrice(p: PosProduct): number {
  const sale = p.salePrice ?? 0;
  return sale > 0 && sale < p.price ? sale : p.price;
}

let paymentRowId = 0;

type Size = NonNullable<PosProduct["sizes"]>[number];
/** The size a product is sold in by default (its default Sizes / Units row), if it has sizes. */
/** A product with its own Quantity (500 Gram) sells as itself first; otherwise its default size row. */
export const defaultSize = (p: PosProduct): Size | null => (p.quantity && p.quantity > 0 ? null : p.sizes?.find((z) => z.isDefault) ?? p.sizes?.[0] ?? null);
export const sizePrice = (z: Size) => (z.price !== null && z.price > 0 && z.price < z.mrp ? z.price : z.mrp);

/** A new bill line for a product (in one of its sizes when it has them). */
function newLine(product: PosProduct, size: Size | null, qty: number): CartLine {
  return {
    productId: product.id, name: product.name, unitPrice: size ? sizePrice(size) : effectivePrice(product), qty,
    stockQty: size?.stockQty ?? product.stockQty, productType: product.productType, categoryId: product.categoryId,
    subcategoryId: product.subcategoryId, gstRate: product.gstRate, unit: size ? size.label : packLabel(product.quantity, product.unit),
    sku: product.sku, image: product.image ?? null, sizeId: size?.id ?? null,
  };
}

function addLine(setCart: React.Dispatch<React.SetStateAction<CartLine[]>>, product: PosProduct, qty: number, checkStock: boolean) {
  const size = defaultSize(product);
  setCart((prev) => {
    const same = (c: CartLine) => c.productId === product.id && (c.sizeId ?? null) === (size?.id ?? null);
    const existing = prev.find(same);
    if (existing) {
      if (checkStock && existing.productType === "physical" && existing.stockQty !== null && existing.qty + qty > existing.stockQty) {
        alert(`Only ${existing.stockQty} in stock for "${product.name}".`);
        return prev;
      }
      return prev.map((c) => (same(c) ? { ...c, qty: c.qty + qty } : c));
    }
    return [...prev, newLine(product, size, qty)];
  });
}

/** `pricesIncludeTax`: GST / Tax Settings — GST is inside the prices instead of added on top. */
export function usePosCart(pricesIncludeTax = false) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<PosCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: String(paymentRowId++), method: "Cash", amount: "0.00" },
  ]);
  const userEditedPayments = useRef(false);

  const addToCart = useCallback((product: PosProduct) => addLine(setCart, product, 1, true), []);

  /**
   * Same as `addToCart`, but for a line that starts at a chosen quantity
   * instead of 1 — used when a quick-added product (one typed in on the
   * spot, not scanned) is entered with its quantity already known, so the
   * cashier isn't left tapping "+" repeatedly right after adding it.
   */
  const addToCartWithQty = useCallback((product: PosProduct, qty: number) => addLine(setCart, product, Math.max(1, Math.floor(qty) || 1), false), []);

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

  /** Switches a line to another variant of the product (same quantity; merges if that variant is already in the cart). */
  /** Switches a line to another variant or size (same quantity; merges if that one is already on the bill). */
  const swapProduct = useCallback((idx: number, product: PosProduct, sizeId?: number | null) => {
    setCart((prev) => {
      const item = prev[idx];
      if (!item) return prev;
      const size = sizeId === undefined ? defaultSize(product) : product.sizes?.find((z) => z.id === sizeId) ?? null;
      const next = newLine(product, size, item.qty);
      if (item.productId === next.productId && (item.sizeId ?? null) === (next.sizeId ?? null)) return prev;
      const other = prev.findIndex((c, i) => i !== idx && c.productId === next.productId && (c.sizeId ?? null) === (next.sizeId ?? null));
      if (other !== -1) {
        return prev.map((c, i) => (i === other ? { ...c, qty: c.qty + item.qty } : c)).filter((_, i) => i !== idx);
      }
      return prev.map((c, i) => (i === idx ? next : c));
    });
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
      gst += lineTax(taxable, c.gstRate || 0, pricesIncludeTax);
    }

    const grandTotal = itemsTotal(Math.max(0, subtotal - discount), gst, pricesIncludeTax);
    return { subtotal, discount, gst, grandTotal };
  }, [cart, appliedCoupon, pricesIncludeTax]);

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
    swapProduct,
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
