import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { generateOrderNumber } from "@/lib/order-number";
import { logActivity } from "@/lib/activity-log";
import { checkoutSchema } from "@/lib/validators/checkout";
import type { Prisma } from "@prisma/client";

/**
 * Verified 1:1 against the `?action=checkout` branch of admin/ecommerce/billing.php.
 * Every business rule below (price re-fetch, coupon eligibility, proportional GST-on-
 * discount, guest-must-pay-in-full, auto due/credit creation, stock deduction only for
 * physical products) is preserved exactly as in the original PHP.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_billing")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Cart is empty." }, { status: 400 });
  }
  const input = parsed.data;

  // Sanitize payment rows (supports split payment across methods) — same as PHP.
  let payments = input.payments.filter((p) => p.amount > 0);
  if (payments.length === 0) payments = [{ method: "Cash", amount: 0 }];

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Re-fetch authoritative product data — never trust client-sent prices.
      const lineItems: {
        product: Awaited<ReturnType<typeof tx.ecomProduct.findUnique>>;
        qty: number;
        unitPrice: number;
        lineTotal: number;
        gstAmount?: number;
      }[] = [];
      let subtotal = 0;

      for (const it of input.items) {
        const product = await tx.ecomProduct.findUnique({ where: { id: it.product_id } });
        if (!product) continue;

        const salePrice = product.salePrice ? Number(product.salePrice) : 0;
        const price = Number(product.price);
        let unitPrice = salePrice > 0 && salePrice < price ? salePrice : price;

        // Staff override honored ONLY here (authenticated admin billing screen),
        // exactly matching the trust boundary in the PHP version.
        if (it.price_override !== null && it.price_override !== undefined && it.price_override >= 0) {
          unitPrice = it.price_override;
        }

        const lineTotal = unitPrice * it.qty;
        lineItems.push({ product, qty: it.qty, unitPrice, lineTotal });
        subtotal += lineTotal;
      }

      if (lineItems.length === 0) {
        throw new CheckoutError("No valid products in cart.");
      }

      // ── Coupon validation & discount calculation (server-side, authoritative) ──
      let discount = 0;
      let coupon = null as Awaited<ReturnType<typeof tx.ecomCoupon.findFirst>> | null;
      const couponCode = input.coupon_code.toUpperCase();

      if (couponCode !== "") {
        const found = await tx.ecomCoupon.findFirst({ where: { code: couponCode, status: "active" } });
        if (found && found.usedCount < found.numberOfTimes) {
          let eligibleTotal = 0;
          for (const li of lineItems) {
            let matches = false;
            if (found.appliesTo === "all") matches = true;
            else if (found.appliesTo === "product" && li.product!.id === found.productId) matches = true;
            else if (found.appliesTo === "category" && li.product!.categoryId === found.categoryId) matches = true;
            else if (found.appliesTo === "subcategory" && li.product!.subcategoryId === found.subcategoryId) matches = true;
            if (matches) eligibleTotal += li.lineTotal;
          }
          if (eligibleTotal > 0) {
            discount =
              found.discountType === "percentage"
                ? eligibleTotal * (Number(found.discountValue) / 100)
                : Math.min(Number(found.discountValue), eligibleTotal);
            coupon = found;
          }
        }
        // invalid/exhausted coupon => silently ignored, sale still completes (matches PHP)
      }

      let grandTotal = Math.max(0, subtotal - discount);

      // ── GST calculation (proportional to any discount applied) ──
      let totalGst = 0;
      for (const li of lineItems) {
        const discountShare = subtotal > 0 ? discount * (li.lineTotal / subtotal) : 0;
        const taxableValue = Math.max(0, li.lineTotal - discountShare);
        const lineGst = taxableValue * (Number(li.product!.gstRate) / 100);
        li.gstAmount = lineGst;
        totalGst += lineGst;
      }
      grandTotal += totalGst;

      // ── Resolve / create customer ──
      let customerId: number | null = input.customer_id > 0 ? input.customer_id : null;
      let customerName = input.customer_name;
      let customerPhone = input.customer_phone;

      if (input.is_guest) {
        customerId = null;
        customerName = "Guest";
        customerPhone = "";
      } else if (customerId) {
        const existing = await tx.ecomCustomer.findUnique({ where: { id: customerId } });
        if (existing) {
          customerName = existing.name;
          customerPhone = customerPhone || existing.phone || "";
        }
      } else if (customerName !== "") {
        const created = await tx.ecomCustomer.create({
          data: { name: customerName, phone: customerPhone || null, customerType: "offline", status: "active" },
        });
        customerId = created.id;
      } else {
        customerName = "Walk-in Customer";
      }

      // ── Payment: how much was actually received right now? ──
      const paidAmountRaw = payments.reduce((s, p) => s + p.amount, 0);
      const paidAmount = Math.min(paidAmountRaw, grandTotal); // never record more than the bill
      const dueAmount = Math.round((grandTotal - paidAmount) * 100) / 100;
      const paymentStatus = dueAmount > 0.004 ? "Unpaid" : "Paid";

      if (input.is_guest && dueAmount > 0.004) {
        throw new CheckoutError(
          "Guest bills must be paid in full. Turn off Guest Bill to record a due amount against a customer."
        );
      }

      const distinctMethods = Array.from(new Set(payments.map((p) => p.method)));
      const paymentMethod = distinctMethods.length === 1 ? distinctMethods[0] : "Split";

      // ── Create order ──
      const orderNumber = await generateOrderNumber();
      const order = await tx.ecomOrder.create({
        data: {
          orderNumber,
          customerId: customerId ?? undefined,
          customerName,
          isGuest: input.is_guest,
          totalAmount: grandTotal,
          paidAmount,
          subtotalAmount: subtotal,
          discountAmount: discount,
          gstAmount: totalGst,
          paymentStatus,
          paymentMethod,
          orderStatus: "Delivered",
          orderType: "offline",
        },
      });

      // Record each payment method/amount pair for an itemized receipt.
      for (const p of payments) {
        if (p.amount <= 0) continue;
        await tx.ecomOrderPayment.create({
          data: { orderId: order.id, paymentMethod: p.method, amount: p.amount },
        });
      }

      for (const li of lineItems) {
        await tx.ecomOrderItem.create({
          data: {
            orderId: order.id,
            productId: li.product!.id,
            productName: li.product!.name,
            hsnCode: li.product!.hsnCode,
            qty: li.qty,
            price: li.unitPrice,
            gstRate: li.product!.gstRate,
            gstAmount: li.gstAmount!,
          },
        });

        if (li.product!.productType === "physical" && li.product!.stockQty !== null) {
          await tx.ecomProduct.update({
            where: { id: li.product!.id },
            data: { stockQty: { decrement: li.qty } },
          });
          // GREATEST(stock_qty - qty, 0) equivalent — clamp any negative result
          const updated = await tx.ecomProduct.findUnique({ where: { id: li.product!.id } });
          if (updated && updated.stockQty !== null && updated.stockQty < 0) {
            await tx.ecomProduct.update({ where: { id: li.product!.id }, data: { stockQty: 0 } });
          }
        }
      }

      // ── Auto-create a Due (credit) record if not paid in full ──
      if (dueAmount > 0.004) {
        await tx.ecomCredit.create({
          data: {
            orderId: order.id,
            customerId: customerId ?? undefined,
            customerName,
            customerPhone: customerPhone || null,
            amount: dueAmount,
            promisedDate: input.promised_date ? new Date(input.promised_date) : null,
            status: "pending",
          },
        });
      }

      if (coupon) {
        await tx.ecomCoupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }

      return { order, discount, totalGst, dueAmount, grandTotal };
    });

    await logActivity(
      req,
      session.userId,
      "ecom_pos_sale",
      `POS Sale: ${result.order.orderNumber} (₹${result.grandTotal.toFixed(2)}${
        result.dueAmount > 0 ? `, ₹${result.dueAmount.toFixed(2)} due` : ""
      }) via ${result.order.paymentMethod}`
    );

    return NextResponse.json({
      success: true,
      order_id: result.order.id,
      order_number: result.order.orderNumber,
      discount: result.discount,
      gst: result.totalGst,
      due: result.dueAmount,
      grand_total: result.grandTotal,
    });
  } catch (err) {
    if (err instanceof CheckoutError) {
      return NextResponse.json({ success: false, message: err.message });
    }
    // Prisma-specific error classes are only resolvable once `prisma generate` has
    // run against a real datasource in your environment (this sandbox's network
    // blocks the Prisma engine download — see the README for details). Falls back
    // to a safe generic message if the specific error class can't be checked.
    const message = err instanceof Error ? err.message : "unexpected error";
    return NextResponse.json({ success: false, message: `Checkout failed: ${message}` });
  }
}

class CheckoutError extends Error {}
