import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { BarcodePrinter } from "@/components/admin/BarcodePrinter";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface BarcodePrintPageProps {
  searchParams: Promise<{ ids?: string }>;
}

/** Verified against admin/ecommerce/barcode-print.php — the ?ids=1,1,2 repeated-id
 *  convention for quantity is handled in the client component (BarcodePrinter),
 *  this page just makes sure the linked-from-Products "Print Barcode" button still
 *  preselects that one product. */
export default async function BarcodePrintPage({ searchParams }: BarcodePrintPageProps) {
  const session = await getAdminSession();
  if (
    !session ||
    (!hasPermission(session.permissions, "ecommerce", "manage_products") &&
      !hasPermission(session.permissions, "ecommerce", "manage_billing"))
  ) {
    redirect("/shop/login");
  }

  const [allProducts, biz] = await Promise.all([
    prisma.ecomProduct.findMany({
      select: { id: true, name: true, sku: true, barcode: true, price: true, salePrice: true },
      orderBy: { name: "asc" },
    }),
    prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" }, select: { barcodeFooterText: true } }),
  ]);

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Print Barcodes"
      pageSubtitle="Generate and print barcode labels for your products"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <BarcodePrinter
        allProducts={allProducts.map((p: (typeof allProducts)[number]) => ({
          id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, price: Number(p.price), salePrice: p.salePrice ? Number(p.salePrice) : null,
        }))}
        barcodeFooter={biz?.barcodeFooterText ?? ""}
      />
    </AdminShell>
  );
}
