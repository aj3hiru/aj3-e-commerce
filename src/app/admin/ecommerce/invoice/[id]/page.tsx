import { notFound, redirect } from "next/navigation";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getInvoiceData } from "@/lib/invoice-data";
import { getInvoiceSetup } from "@/lib/invoice-settings";
import { resolveSeller } from "@/types/invoice-settings";
import { A4InvoiceSheet } from "@/components/invoice/A4InvoiceSheet";
import { ThermalReceipt } from "@/components/invoice/ThermalReceipt";
import { InvoiceFormatChooser, InvoicePrintShell } from "@/components/invoice/InvoicePrintShell";

interface InvoicePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string; print?: string }>;
}

export const metadata = { title: "Invoice", robots: { index: false, follow: false } };

/**
 * One invoice, printed the way Business Settings → Invoice Settings says:
 * A4, thermal, or ask each time. ?format= picks one for this print
 * (a4 | thermal | thermal_58 | thermal_80); ?print=1 opens the print dialog.
 */
export default async function InvoicePage({ params, searchParams }: InvoicePageProps) {
  const session = await getAdminSession();
  if (
    !session ||
    (!hasPermission(session.permissions, "orders", "view") &&
      !hasPermission(session.permissions, "ecommerce", "manage_customers") &&
      !hasPermission(session.permissions, "ecommerce", "manage_billing"))
  ) {
    redirect("/staff/login");
  }

  const [{ id }, { format, print }] = await Promise.all([params, searchParams]);
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();

  const [data, { settings, profile }] = await Promise.all([getInvoiceData(orderId), getInvoiceSetup()]);
  if (!data) notFound();

  const s = { ...settings };
  if (format === "thermal_58") s.thermalWidth = "58mm";
  if (format === "thermal_80") s.thermalWidth = "80mm";
  const kind = format === "a4" ? "a4" : format?.startsWith("thermal") ? "thermal" : s.defaultPrint;
  if (kind === "ask") return <InvoiceFormatChooser number={data.order.orderNumber} thermalWidth={s.thermalWidth} />;

  const seller = resolveSeller(s, profile);
  const autoPrint = print === "1" || (s.autoPrint && print !== "0");
  return (
    <InvoicePrintShell kind={kind} width={s.thermalWidth} autoPrint={autoPrint}>
      {kind === "a4" ? <A4InvoiceSheet data={data} s={s} seller={seller} /> : <ThermalReceipt data={data} s={s} seller={seller} />}
    </InvoicePrintShell>
  );
}
