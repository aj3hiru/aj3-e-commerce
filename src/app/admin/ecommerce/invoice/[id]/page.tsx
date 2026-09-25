import { notFound, redirect } from "next/navigation";
import { A4Invoice } from "@/components/admin/A4Invoice";
import { ThermalInvoice } from "@/components/admin/ThermalInvoice";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getInvoiceData, getInvoiceBusinessSettings } from "@/lib/invoice-data";

interface InvoicePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}

/** Verified against admin/ecommerce/invoice.php: three-permission access gate,
 *  ?format= override falling back to the business's default printer_format. */
export default async function InvoicePage({ params, searchParams }: InvoicePageProps) {
  const session = await getAdminSession();
  if (
    !session ||
    (!hasPermission(session.permissions, "orders", "view") &&
      !hasPermission(session.permissions, "ecommerce", "manage_customers") &&
      !hasPermission(session.permissions, "ecommerce", "manage_billing"))
  ) {
    redirect("/shop/login");
  }

  const { id } = await params;
  const { format: formatParam } = await searchParams;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  const [data, biz] = await Promise.all([getInvoiceData(orderId), getInvoiceBusinessSettings()]);
  if (!data) notFound();

  const format = (["a4", "thermal_58", "thermal_80"].includes(formatParam ?? "") ? formatParam : biz.printerFormat) as "a4" | "thermal_58" | "thermal_80";
  const isThermal = format.startsWith("thermal_");

  if (isThermal) {
    return <ThermalInvoice data={data} biz={biz} siteName="EduMint24" width={format === "thermal_58" ? "58mm" : "80mm"} />;
  }
  return <A4Invoice data={data} biz={biz} siteName="EduMint24" />;
}
