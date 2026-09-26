import { prisma } from "./db";

export interface InvoiceData {
  order: {
    id: number;
    orderNumber: string;
    customerName: string;
    customerEmail: string | null;
    orderType: string;
    paymentStatus: string;
    orderStatus: string;
    paymentMethod: string;
    createdAt: Date;
    shippingAddress: string | null;
    /** Google Maps link to the pinned delivery spot, when the customer shared one. */
    mapUrl: string | null;
  };
  customer: { name: string; email: string | null; phone: string | null; address: string | null } | null;
  items: { productName: string; hsnCode: string | null; qty: number; price: number; gstRate: number }[];
  itemCount: number;
  totalQty: number;
  subtotal: number;
  discount: number;
  /** Business Settings → Delivery Charge paid on this (online) order. */
  deliveryCharge: number;
  totalGst: number;
  cgst: number;
  sgst: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  isFullyPaid: boolean;
  paymentBreakdown: { paymentMethod: string; total: number }[];
  duePaymentHistory: { createdAt: Date; paymentMethod: string; amount: number; balanceAfter: number }[];
  linkedCreditAmount: number | null;
}

/**
 * Verified 1:1 against the calculation block at the top of admin/ecommerce/invoice.php.
 * The key subtlety preserved here: `paidAmount`/`dueAmount` reflect payments made
 * AFTER the original sale too (via the linked EcomCredit + its EcomCreditPayment
 * history), not just what was paid at checkout time — so an invoice printed today
 * for an order from last week shows the current due status, not the day-of-sale
 * snapshot.
 */
export async function getInvoiceData(orderId: number): Promise<InvoiceData | null> {
  const order = await prisma.ecomOrder.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: { select: { name: true, email: true, phone: true, address: true } },
      payments: true,
      credits: { include: { payments: { orderBy: { createdAt: "asc" } } }, take: 1 },
    },
  });
  if (!order) return null;

  const items = order.items.map((it: (typeof order.items)[number]) => ({
    productName: it.productName,
    hsnCode: it.hsnCode,
    qty: it.qty,
    price: Number(it.price),
    gstRate: Number(it.gstRate),
  }));

  const itemCount = items.length;
  const totalQty = items.reduce((s: number, it: (typeof items)[number]) => s + it.qty, 0);
  const computedSubtotal = items.reduce((s: number, it: (typeof items)[number]) => s + it.price * it.qty, 0);

  const grandTotal = Number(order.totalAmount);
  const subtotal = Number(order.subtotalAmount) > 0 ? Number(order.subtotalAmount) : computedSubtotal;
  const discount = Number(order.discountAmount) > 0 ? Number(order.discountAmount) : Math.max(0, subtotal - grandTotal);
  const totalGst = Number(order.gstAmount);
  const deliveryCharge = Number(order.deliveryCharge ?? 0);
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;

  let paidAmount = order.paidAmount !== null ? Number(order.paidAmount) : grandTotal;

  const paymentBreakdownMap = new Map<string, number>();
  for (const p of order.payments) {
    paymentBreakdownMap.set(p.paymentMethod, (paymentBreakdownMap.get(p.paymentMethod) ?? 0) + Number(p.amount));
  }
  const paymentBreakdown = Array.from(paymentBreakdownMap.entries())
    .map(([paymentMethod, total]) => ({ paymentMethod, total }))
    .sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod));

  const linkedCredit = order.credits[0] ?? null;
  let duePaymentHistory: InvoiceData["duePaymentHistory"] = [];
  let linkedCreditAmount: number | null = null;

  if (linkedCredit) {
    const paidAmountAtSale = paidAmount;
    paidAmount = paidAmount + Number(linkedCredit.amountPaid);
    linkedCreditAmount = Number(linkedCredit.amount);

    let runningPaid = paidAmountAtSale;
    duePaymentHistory = linkedCredit.payments.map((h: (typeof linkedCredit.payments)[number]) => {
      runningPaid += Number(h.amount);
      return {
        createdAt: h.createdAt,
        paymentMethod: h.paymentMethod,
        amount: Number(h.amount),
        balanceAfter: Math.max(0, grandTotal - runningPaid),
      };
    });
  }

  const dueAmount = Math.max(0, grandTotal - paidAmount);
  const isFullyPaid = linkedCredit ? linkedCredit.status === "paid" : dueAmount <= 0.004;

  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      orderType: order.orderType,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      shippingAddress: order.shippingAddress,
      mapUrl: order.shippingLat !== null && order.shippingLng !== null ? `https://maps.google.com/?q=${Number(order.shippingLat)},${Number(order.shippingLng)}` : null,
    },
    customer: order.customer,
    items,
    itemCount,
    totalQty,
    subtotal,
    discount,
    deliveryCharge,
    totalGst,
    cgst,
    sgst,
    grandTotal,
    paidAmount,
    dueAmount,
    isFullyPaid,
    paymentBreakdown,
    duePaymentHistory,
    linkedCreditAmount,
  };
}

export interface InvoiceBusinessSettings {
  businessName: string;
  logo: string | null;
  logoDisplayWidth: number;
  address: string | null;
  location: string | null;
  email: string | null;
  invoiceNumbers: string[];
  gstin: string | null;
  panNumber: string | null;
  fssaiNumber: string | null;
  hasGstin: boolean;
  hasPan: boolean;
  hasFssai: boolean;
  showAddressOnInvoice: boolean;
  showLocationOnInvoice: boolean;
  invoiceDisplay: "logo" | "name" | "both";
  invoiceTitle: string;
  invoiceFooterNote: string | null;
  printerFormat: string;
}

/** Verified against the $biz-derived variables in invoice.php's header. */
export async function getInvoiceBusinessSettings(): Promise<InvoiceBusinessSettings> {
  const biz = await prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } });

  const showGstin = biz?.showGstinOnInvoice ?? true;
  const showPan = biz?.showPanOnInvoice ?? true;
  const showFssai = biz?.showFssaiOnInvoice ?? true;

  const invoiceNumbers = (biz?.invoiceContactNumbers as string[] | null) ?? (biz?.phone ? [biz.phone] : []);

  return {
    businessName: biz?.businessName ?? "My Business",
    logo: biz?.logo ?? null,
    logoDisplayWidth: biz?.logoDisplayWidth ?? 150,
    address: biz?.address ?? null,
    location: biz?.location ?? null,
    email: biz?.email ?? null,
    invoiceNumbers,
    gstin: biz?.gstin ?? null,
    panNumber: biz?.panNumber ?? null,
    fssaiNumber: biz?.fssaiNumber ?? null,
    hasGstin: !!biz?.gstin && showGstin,
    hasPan: !!biz?.panNumber && showPan,
    hasFssai: !!biz?.fssaiNumber && showFssai,
    showAddressOnInvoice: biz?.showAddressOnInvoice ?? true,
    showLocationOnInvoice: biz?.showLocationOnInvoice ?? true,
    invoiceDisplay: (biz?.invoiceDisplay as "logo" | "name" | "both") ?? "both",
    invoiceTitle: biz?.invoiceTitle ?? "Tax Invoice",
    invoiceFooterNote: biz?.invoiceFooterNote ?? null,
    printerFormat: biz?.printerFormat ?? "a4",
  };
}
