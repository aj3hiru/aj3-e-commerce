import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { generateReceiptNumber } from "@/lib/order-number";
import { logActivity } from "@/lib/activity-log";
import type { Prisma } from "@prisma/client";
import { withApiErrors } from "@/lib/api-errors";

/**
 * Verified 1:1 against record-due-payment.php: accepts parallel arrays of
 * credit_ids/amounts, clamps each payment to the remaining balance (never
 * overpay), marks a credit 'paid' once its balance reaches ~0, and issues
 * either one shared receipt number for the whole batch or one per credit.
 */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (
    !session ||
    (!hasPermission(session.permissions, "ecommerce", "manage_credits") &&
      !hasPermission(session.permissions, "ecommerce", "manage_customers") &&
      !hasPermission(session.permissions, "ecommerce", "manage_billing"))
  ) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const creditIds: number[] = Array.isArray(body.creditIds) ? body.creditIds.map(Number) : [];
  const amounts: number[] = Array.isArray(body.amounts) ? body.amounts.map(Number) : [];
  const paymentMethod: string = (body.paymentMethod ?? "Cash").trim() || "Cash";
  const combineReceipt: boolean = !!body.combineReceipt;

  if (creditIds.length === 0 || creditIds.length !== amounts.length) {
    return NextResponse.json({ success: false, message: "No payment selected." }, { status: 400 });
  }

  try {
    const createdReceipts: string[] = [];
    const sharedReceipt = combineReceipt ? await generateReceiptNumber() : null;

    for (let i = 0; i < creditIds.length; i++) {
      const cid = creditIds[i];
      const amount = amounts[i];
      if (!Number.isInteger(cid) || cid <= 0 || !(amount > 0)) continue;

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // No-op UPDATE first: it takes the row lock, so two payments recorded at
        // the same moment can't both read the same balance and overpay.
        const locked = await tx.ecomCredit.updateMany({ where: { id: cid }, data: { amountPaid: { increment: 0 } } });
        if (locked.count === 0) return null;
        const credit = await tx.ecomCredit.findUnique({ where: { id: cid } });
        if (!credit) return null;

        const balance = Number(credit.amount) - Number(credit.amountPaid);
        const clampedAmount = Math.min(amount, balance); // never overpay
        if (clampedAmount <= 0) return null;

        const newPaid = Number(credit.amountPaid) + clampedAmount;
        const newStatus = newPaid >= Number(credit.amount) - 0.004 ? "paid" : "pending";

        await tx.ecomCredit.update({ where: { id: cid }, data: { amountPaid: newPaid, status: newStatus } });

        // Keep the order itself in step: money collected against its due counts
        // as paid on the order, and a fully settled order stops showing "Unpaid".
        const order = await tx.ecomOrder.findUnique({ where: { id: credit.orderId }, select: { totalAmount: true, paidAmount: true } });
        if (order) {
          const orderPaid = Math.min(Number(order.totalAmount), Number(order.paidAmount) + clampedAmount);
          await tx.ecomOrder.update({
            where: { id: credit.orderId },
            data: { paidAmount: orderPaid, paymentStatus: orderPaid >= Number(order.totalAmount) - 0.004 ? "Paid" : "Unpaid" },
          });
        }

        const receiptNumber = sharedReceipt ?? (await generateReceiptNumber(tx));
        await tx.ecomCreditPayment.create({
          data: { creditId: cid, receiptNumber, amount: clampedAmount, paymentMethod, createdBy: session.userId },
        });

        return { receiptNumber, customerName: credit.customerName, amount: clampedAmount };
      });

      if (result) {
        createdReceipts.push(result.receiptNumber);
        await logActivity(
          req,
          session.userId,
          "ecom_credit_payment",
          `Recorded due payment: ₹${result.amount.toFixed(2)} from ${result.customerName} (Receipt: ${result.receiptNumber})`
        );
      }
    }

    if (createdReceipts.length === 0) {
      return NextResponse.json({ success: false, message: "Nothing was recorded — check the amounts entered." });
    }

    const uniqueReceipts = Array.from(new Set(createdReceipts));
    if (uniqueReceipts.length === 1) {
      return NextResponse.json({ success: true, redirect: `/admin/ecommerce/payment-receipt/${uniqueReceipts[0]}` });
    }
    return NextResponse.json({
      success: true,
      redirect: `/admin/ecommerce/due?success=payment&receipts=${encodeURIComponent(uniqueReceipts.join(","))}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unexpected error";
    return NextResponse.json({ success: false, message: `Could not save payment: ${message}` }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
