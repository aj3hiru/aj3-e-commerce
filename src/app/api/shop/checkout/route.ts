import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCart, setCart } from "@/lib/cart-session";
import { generateOrderNumber } from "@/lib/order-number";
import type { Prisma } from "@prisma/client";
import { findRedeemableCoupon, consumeCouponUse } from "@/lib/coupon-redeem";
import { campaignPriceFor, type CampaignPrice } from "@/lib/campaign-core";
import { loadLiveCampaigns, recordCampaignSales, type CampaignSaleInput } from "@/lib/campaign-pricing";

/** Verified 1:1 against shop/checkout.php's POST handler: re-validates stock,
 *  re-fetches prices server-side, applies an optional coupon with proportional
 *  GST-on-discount (same rules as the Phase 3 POS checkout), deducts stock,
 *  clears the cart, and creates an 'online'/'Pending'/'Unpaid' order. */
export async function POST(req: NextRequest) {
  const customer = await getCustomerSession();
  if (!customer) {
    return NextResponse.json({ success: false, message: "Please login first.", need_login: true }, { status: 401 });
  }

  const cart = await getCart();
  if (Object.keys(cart).length === 0) {
    return NextResponse.json({ success: false, message: "Your cart is empty." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const address = (body.address ?? "").trim();
  const paymentMethod = (body.paymentMethod ?? "").trim();
  const couponCode = (body.couponCode ?? "").trim().toUpperCase();

  if (!address) return NextResponse.json({ success: false, message: "Please enter a delivery address." }, { status: 400 });
  if (!paymentMethod) return NextResponse.json({ success: false, message: "Please select a payment method." }, { status: 400 });

  // Campaign prices are worked out from the campaigns as they are right now.
  // This is read before the order is opened; if it can't be read the order simply
  // goes ahead at normal prices.
  const now = new Date();
  const liveCampaigns = await loadLiveCampaigns({ fresh: true });

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ids = Object.keys(cart).map(Number);
      const products = await tx.ecomProduct.findMany({ where: { id: { in: ids }, status: "active" } });

      const lineItems: { product: (typeof products)[number]; qty: number; unitPrice: number; lineTotal: number; gstAmount?: number; campaign: CampaignPrice | null }[] = [];
      let subtotal = 0;

      for (const p of products) {
        let qty = cart[p.id] ?? 0;
        if (qty <= 0) continue;
        if (p.productType === "physical" && p.stockQty !== null && qty > p.stockQty) qty = p.stockQty;
        if (qty <= 0) continue;

        const price = Number(p.price);
        const sale = p.salePrice ? Number(p.salePrice) : 0;
        let unitPrice = sale > 0 && sale < price ? sale : price;
        // A live campaign can only lower the price (never stacks with the sale price).
        const campaign = campaignPriceFor({ id: p.id, categoryId: p.categoryId, brandId: p.brandId, price, salePrice: sale > 0 ? sale : null }, liveCampaigns, now);
        if (campaign) unitPrice = campaign.unitPrice;
        const lineTotal = unitPrice * qty;
        lineItems.push({ product: p, qty, unitPrice, lineTotal, campaign });
        subtotal += lineTotal;
      }

      if (lineItems.length === 0) {
        throw new CheckoutError("Your cart items are no longer available.");
      }

      let discount = 0;
      let coupon = null as Awaited<ReturnType<typeof tx.ecomCoupon.findFirst>> | null;
      if (couponCode !== "") {
        const found = await findRedeemableCoupon(tx, couponCode, now);
        if (found) {
          let eligible = 0;
          for (const li of lineItems) {
            const matches =
              found.appliesTo === "all" ||
              (found.appliesTo === "product" && li.product.id === found.productId) ||
              (found.appliesTo === "category" && li.product.categoryId === found.categoryId) ||
              (found.appliesTo === "subcategory" && li.product.subcategoryId === found.subcategoryId);
            if (matches) eligible += li.lineTotal;
          }
          if (eligible > 0) {
            discount = found.discountType === "percentage" ? eligible * (Number(found.discountValue) / 100) : Math.min(Number(found.discountValue), eligible);
            coupon = found;
          }
        }
      }

      let grandTotal = Math.max(0, subtotal - discount);

      let totalGst = 0;
      for (const li of lineItems) {
        const discountShare = subtotal > 0 ? discount * (li.lineTotal / subtotal) : 0;
        const taxable = Math.max(0, li.lineTotal - discountShare);
        const lineGst = taxable * (Number(li.product.gstRate) / 100);
        li.gstAmount = lineGst;
        totalGst += lineGst;
      }
      grandTotal += totalGst;

      await tx.ecomCustomer.update({ where: { id: customer.customerId }, data: { address } });

      const orderNumber = await generateOrderNumber(tx);
      const custRow = await tx.ecomCustomer.findUnique({ where: { id: customer.customerId } });
      const order = await tx.ecomOrder.create({
        data: {
          orderNumber,
          customerId: customer.customerId,
          customerName: custRow!.name,
          customerEmail: custRow!.email,
          shippingAddress: address,
          totalAmount: grandTotal,
          subtotalAmount: subtotal,
          discountAmount: discount,
          gstAmount: totalGst,
          paymentStatus: "Unpaid",
          paymentMethod,
          orderStatus: "Pending",
          orderType: "online",
        },
      });

      const campaignSales: CampaignSaleInput[] = [];
      for (const li of lineItems) {
        const item = await tx.ecomOrderItem.create({
          data: {
            orderId: order.id, productId: li.product.id, productName: li.product.name, hsnCode: li.product.hsnCode,
            qty: li.qty, price: li.unitPrice, gstRate: li.product.gstRate, gstAmount: li.gstAmount!,
          },
          select: { id: true },
        });
        if (li.campaign) {
          campaignSales.push({
            campaignId: li.campaign.campaignId, orderId: order.id, orderItemId: item.id, productId: li.product.id,
            qty: li.qty, unitPrice: li.unitPrice, discountPerUnit: li.campaign.discountPerUnit,
          });
        }
        if (li.product.productType === "physical" && li.product.stockQty !== null) {
          // Conditional atomic decrement: if another order took the stock since we
          // read it, nothing is updated and the whole order rolls back instead of overselling.
          const taken = await tx.ecomProduct.updateMany({
            where: { id: li.product.id, stockQty: { gte: li.qty } },
            data: { stockQty: { decrement: li.qty } },
          });
          if (taken.count === 0) {
            throw new CheckoutError(`Sorry, "${li.product.name}" just went out of stock. Please update your cart.`);
          }
        }
      }

      if (coupon && !(await consumeCouponUse(tx, coupon.id))) {
        throw new CheckoutError("This coupon has just reached its usage limit. Please remove it and try again.");
      }

      return { orderId: order.id, campaignSales };
    });

    // Remember which lines were sold under a campaign (after the order is safely saved; never throws).
    await recordCampaignSales(result.campaignSales);

    await setCart({});

    return NextResponse.json({ success: true, order_id: result.orderId });
  } catch (err) {
    if (err instanceof CheckoutError) {
      return NextResponse.json({ success: false, message: err.message });
    }
    const message = err instanceof Error ? err.message : "unexpected error";
    return NextResponse.json({ success: false, message: `Could not place order: ${message}` }, { status: 500 });
  }
}

class CheckoutError extends Error {}
