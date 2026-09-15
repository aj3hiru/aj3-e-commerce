import { prisma } from "./db";

export interface ReceiptData {
  receiptNumber: string;
  customerName: string;
  customerPhone: string | null;
  paidAt: Date;
  payments: { orderId: number | null; orderNumber: string | null; paymentMethod: string; amount: number }[];
  totalPaidThisReceipt: number;
  totalOutstanding: number;
  allClear: boolean;
}

/** Verified against payment-receipt.php: pulls every EcomCreditPayment row sharing
 *  this receipt number (a batch payment can cover several credits/orders at once),
 *  then separately computes the customer's TOTAL outstanding balance across every
 *  purchase — not just what's covered by this specific receipt. */
export async function getReceiptData(receiptNumber: string): Promise<ReceiptData | null> {
  const payments = await prisma.ecomCreditPayment.findMany({
    where: { receiptNumber },
    orderBy: { id: "asc" },
    include: { credit: { include: { order: { select: { id: true, orderNumber: true } } } } },
  });
  if (payments.length === 0) return null;

  const first = payments[0];
  const customerName = first.credit.customerName;
  const customerPhone = first.credit.customerPhone;
  const customerId = first.credit.customerId;
  const totalPaidThisReceipt = payments.reduce((s: number, p: (typeof payments)[number]) => s + Number(p.amount), 0);

  let totalOutstanding: number;
  if (customerId) {
    const agg = await prisma.ecomCredit.aggregate({
      where: { customerId, status: "pending" },
      _sum: { amount: true, amountPaid: true },
    });
    totalOutstanding = Math.max(0, Number(agg._sum.amount ?? 0) - Number(agg._sum.amountPaid ?? 0));
  } else {
    totalOutstanding = Math.max(0, Number(first.credit.amount) - Number(first.credit.amountPaid));
  }

  return {
    receiptNumber,
    customerName,
    customerPhone,
    paidAt: first.createdAt,
    payments: payments.map((p: (typeof payments)[number]) => ({
      orderId: p.credit.order?.id ?? null,
      orderNumber: p.credit.order?.orderNumber ?? null,
      paymentMethod: p.paymentMethod,
      amount: Number(p.amount),
    })),
    totalPaidThisReceipt,
    totalOutstanding,
    allClear: totalOutstanding <= 0.004,
  };
}
