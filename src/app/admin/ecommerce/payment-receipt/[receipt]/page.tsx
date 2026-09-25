import { notFound, redirect } from "next/navigation";
import { PaymentReceipt } from "@/components/admin/PaymentReceipt";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getReceiptData } from "@/lib/receipt-data";
import { prisma } from "@/lib/db";

interface PaymentReceiptPageProps {
  params: Promise<{ receipt: string }>;
  searchParams: Promise<{ format?: string; return_to?: string }>;
}

/** Verified against admin/ecommerce/payment-receipt.php's access gate and
 *  ?format=/&return_to= handling. */
export default async function PaymentReceiptPage({ params, searchParams }: PaymentReceiptPageProps) {
  const session = await getAdminSession();
  if (
    !session ||
    (!hasPermission(session.permissions, "ecommerce", "manage_credits") &&
      !hasPermission(session.permissions, "ecommerce", "manage_customers") &&
      !hasPermission(session.permissions, "ecommerce", "manage_billing"))
  ) {
    redirect("/staff/login");
  }

  const { receipt } = await params;
  const { format: formatParam, return_to } = await searchParams;
  const receiptNumber = decodeURIComponent(receipt).trim();

  const [data, biz] = await Promise.all([
    getReceiptData(receiptNumber),
    prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" } }),
  ]);
  if (!data) notFound();

  const format = (["a4", "thermal_58", "thermal_80"].includes(formatParam ?? "") ? formatParam : biz?.printerFormat ?? "a4") as
    | "a4"
    | "thermal_58"
    | "thermal_80";

  return (
    <PaymentReceipt
      data={data}
      businessName={biz?.businessName ?? "EduMint24"}
      phone={biz?.phone ?? null}
      format={format}
      returnTo={return_to || "/admin/ecommerce/due"}
    />
  );
}
