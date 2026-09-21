import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { Barcodes2Body, Barcodes2HeaderButtons } from "@/components/admin/barcodes2/Barcodes2Body";
import { BARCODES2_GROUPS, BARCODES2_PREF_KEY, BARCODES2_STANDALONE } from "@/components/admin/barcodes2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getBarcodes2Data, parseBarcodeRange } from "@/lib/barcodes2";

/**
 * /admin/ecommerce/barcode-print2 — a redesign of Print Barcodes, kept
 * alongside /admin/ecommerce/barcode-print. Same access rule, no database
 * change.
 *
 * Unlike the old page it does NOT load every product: it starts with the
 * products added or changed in the chosen dates (today by default) and finds
 * anything else through a server-side search, so it stays fast with thousands
 * of products.
 *
 * ?ids=1,1,2 still works, so the "Print Barcode" button on other pages can
 * link here; a repeated id means a bigger quantity.
 */
interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BarcodePrint2Page({ searchParams }: PageProps) {
  const session = await getAdminSession();
  if (
    !session ||
    (!hasPermission(session.permissions, "ecommerce", "manage_products") &&
      !hasPermission(session.permissions, "ecommerce", "manage_billing"))
  ) {
    redirect("/shop/login");
  }

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = parseBarcodeRange({ from: first(sp.from), to: first(sp.to) });

  const ids = (first(sp.ids) ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const data = await getBarcodes2Data(range, [...new Set(ids)]);

  return (
    <DashboardWidgetPrefsProvider prefKey={BARCODES2_PREF_KEY} groups={BARCODES2_GROUPS} standalone={BARCODES2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Print Barcodes"
        pageSubtitle="Print price labels for the products you added or restocked"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={
          <div className="hidden items-center gap-3 xl:flex">
            <DisplayOptionsPanel variant="header" />
            <Barcodes2HeaderButtons />
          </div>
        }
      >
        {/* Below 1280px the header has no room, so the same controls move here. */}
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 xl:hidden">
          <DisplayOptionsPanel variant="toolbar" />
          <Barcodes2HeaderButtons />
        </div>
        <Barcodes2Body data={data} />
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
