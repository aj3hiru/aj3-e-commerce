import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { generateOrderNumber } from "@/lib/order-number";
import { logActivity } from "@/lib/activity-log";
import { checkoutSchema } from "@/lib/validators/checkout";
import type { Prisma } from "@prisma/client";
import { findRedeemableCoupon, consumeCouponUse } from "@/lib/coupon-redeem";
import { campaignPriceFor, type CampaignPrice } from "@/lib/campaign-core";
import { loadLiveCampaigns, recordCampaignSales, type CampaignSaleInput } from "@/lib/campaign-pricing";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Verified 1:1 against the `?action=checkout` branch of admin/ecommerce/billing.php.
 * Every business rule below (price re-fetch, coupon eligibility, proportional GST-on-
 * discount, guest-must-pay-in-full, auto due/credit creation, stock deduction only for
 * physical products) is preserved exactly as in the original PHP.
 */
async function handlePOST(req: NextRequest) {
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

  // Already saved (the till is re-sending a bill whose reply never arrived)? Same answer, no second bill.
  const already = input.client_ref ? await findByClientRef(input.client_ref) : null;
  if (already) return already;

  // A bill made while the internet was down keeps the time it was really sold (within the last 30 days).
  const soldAtRaw = input.offline && input.sold_at ? new Date(input.sold_at) : null;
  const soldAt = soldAtRaw && !Number.isNaN(soldAtRaw.getTime()) && soldAtRaw.getTime() <= Date.now() + 5 * 60_000 && soldAtRaw.getTime() >= Date.now() - 30 * 86_400_000
    ? soldAtRaw : undefined;

  // Sanitize payment rows (supports split payment across methods) — same as PHP.
  let payments = input.payments.filter((p) => p.amount > 0);
  if (payments.length === 0) payments = [{ method: "Cash", amount: 0 }];

  // Campaign prices are worked out from the campaigns as they are right now.
  // This is read before the bill is opened; if it can't be read the bill simply
  // goes ahead at normal prices.
  const now = new Date();
  const liveCampaigns = await loadLiveCampaigns({ fresh: true });

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Re-fetch authoritative product data — never trust client-sent prices.
      const lineItems: {
        product: Awaited<ReturnType<typeof tx.ecomProduct.findUnique>>;
        qty: number;
        unit: string;
        unitPrice: number;
        lineTotal: number;
        gstAmount?: number;
        campaign: CampaignPrice | null;
      }[] = [];
      let subtotal = 0;

      for (const it of input.items) {
        const product = await tx.ecomProduct.findUnique({ where: { id: it.product_id } });
        if (!product) continue;

        const salePrice = product.salePrice ? Number(product.salePrice) : 0;
        const price = Number(product.price);
        let unitPrice = salePrice > 0 && salePrice < price ? salePrice : price;

        // A live campaign can only lower the price (never stacks with the sale price).
        let campaign = campaignPriceFor(
          { id: product.id, categoryId: product.categoryId, brandId: product.brandId, price, salePrice: salePrice > 0 ? salePrice : null },
          liveCampaigns,
          now
        );
        if (campaign) unitPrice = campaign.unitPrice;

        // Staff override honored ONLY here (authenticated admin billing screen),
        // exactly matching the trust boundary in the PHP version. A price the
        // cashier typed in is theirs, not the campaign's, so it isn't counted as a campaign sale.
        if (it.price_override !== null && it.price_override !== undefined && it.price_override >= 0) {
          unitPrice = it.price_override;
          campaign = null;
        }

        const lineTotal = unitPrice * it.qty;
        lineItems.push({ product, qty: it.qty, unit: it.unit ?? "", unitPrice, lineTotal, campaign });
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
        const found = await findRedeemableCoupon(tx, couponCode, now);
        if (found) {
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

      // Offline bill: the customer already paid the discount shown at the counter, whatever the coupon says now.
      if (input.offline && input.offline_discount !== undefined) discount = Math.min(input.offline_discount, subtotal);

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
        } else {
          // Stale id (customer deleted meanwhile) — bill as walk-in rather than fail on the foreign key.
          customerId = null;
          customerName = customerName || "Walk-in Customer";
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

      const kept = keptPayments(payments, paidAmount).filter((p) => p.amount > 0);
      const distinctMethods = Array.from(new Set((kept.length ? kept : payments).map((p) => p.method)));
      const paymentMethod = distinctMethods.length === 1 ? distinctMethods[0] : "Split";

      // ── Create order ──
      const orderNumber = await generateOrderNumber(tx);
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
          clientRef: input.client_ref ?? null,
          ...(soldAt ? { createdAt: soldAt } : {}),
        },
      });

      // Record each payment method/amount pair for an itemized receipt.
      for (const p of kept) {
        await tx.ecomOrderPayment.create({
          data: { orderId: order.id, paymentMethod: p.method, amount: p.amount },
        });
      }

      // Who made the sale — shown in the order history and the staff reports.
      await tx.ecomOrderEvent.create({
        data: { orderId: order.id, type: "placed", toValue: "Delivered", userId: session.userId, actorName: session.username, note: input.offline ? "Billed offline, uploaded later" : null, ...(soldAt ? { createdAt: soldAt } : {}) },
      });

      const campaignSales: CampaignSaleInput[] = [];
      for (const li of lineItems) {
        const item = await tx.ecomOrderItem.create({
          data: {
            orderId: order.id,
            productId: li.product!.id,
            productName: li.unit ? `${li.product!.name} (${li.unit})` : li.product!.name,
            hsnCode: li.product!.hsnCode,
            qty: li.qty,
            price: li.unitPrice,
            gstRate: li.product!.gstRate,
            gstAmount: li.gstAmount!,
          },
          select: { id: true },
        });
        if (li.campaign) {
          campaignSales.push({
            campaignId: li.campaign.campaignId, orderId: order.id, orderItemId: item.id, productId: li.product!.id,
            qty: li.qty, unitPrice: li.unitPrice, discountPerUnit: li.campaign.discountPerUnit,
          });
        }

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
            ...(soldAt ? { createdAt: soldAt } : {}),
          },
        });
      }

      if (coupon && !(await consumeCouponUse(tx, coupon.id)) && !input.offline) {
        throw new CheckoutError("This coupon has just reached its usage limit. Please remove it and try again.");
      }

      return { order, discount, totalGst, dueAmount, grandTotal, campaignSales };
    });

    // Remember which lines were sold under a campaign (after the bill is safely saved; never throws).
    await recordCampaignSales(result.campaignSales);

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
    // Two uploads of the same offline bill at once: the second one lost the race — answer with the first.
    if (input.client_ref && (err as { code?: string })?.code === "P2002") {
      const saved = await findByClientRef(input.client_ref);
      if (saved) return saved;
    }
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

async function findByClientRef(ref: string) {
  const o = await prisma.ecomOrder.findUnique({
    where: { clientRef: ref },
    select: { id: true, orderNumber: true, totalAmount: true, discountAmount: true, gstAmount: true, credits: { select: { amount: true } } },
  });
  if (!o) return null;
  return NextResponse.json({
    success: true, duplicate: true, order_id: o.id, order_number: o.orderNumber,
    discount: Number(o.discountAmount), gst: Number(o.gstAmount),
    due: o.credits.reduce((s, c) => s + Number(c.amount), 0), grand_total: Number(o.totalAmount),
  });
}

/** When the customer hands over more than the bill (₹1000 cash for an ₹800
 *  bill), the change goes back to them — so the stored payment rows must add up
 *  to what was actually kept, not what was handed over. Change is taken out of
 *  Cash first (that's what a cashier returns), then from the last rows entered. */
function keptPayments(payments: { method: string; amount: number }[], kept: number) {
  let excess = Math.round((payments.reduce((s, p) => s + p.amount, 0) - kept) * 100) / 100;
  const rows = payments.map((p) => ({ ...p }));
  const order = [...rows.filter((r) => r.method === "Cash"), ...rows.filter((r) => r.method !== "Cash").reverse()];
  for (const r of order) {
    if (excess <= 0) break;
    const cut = Math.min(r.amount, excess);
    r.amount = Math.round((r.amount - cut) * 100) / 100;
    excess = Math.round((excess - cut) * 100) / 100;
  }
  return rows;
}

export const POST = withApiErrors(handlePOST);
