import { redirect } from "next/navigation";
import Link from "next/link";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { AccountProfileForm } from "@/components/shop/AccountProfileForm";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/db";

interface AccountPageProps {
  searchParams: Promise<{ welcome?: string }>;
}

/** Verified against shop/account.php. */
export default async function AccountPage({ searchParams }: AccountPageProps) {
  const customer = await getCustomerSession();
  if (!customer) redirect(`/shop/login?redirect=${encodeURIComponent("/shop/account")}`);

  const { welcome } = await searchParams;
  const [layoutData, full, orders] = await Promise.all([
    getShopLayoutData(),
    prisma.ecomCustomer.findUnique({ where: { id: customer.customerId } }),
    prisma.ecomOrder.findMany({ where: { customerId: customer.customerId }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <ShopLayout {...layoutData}>
      <h2 className="text-lg font-bold mb-4">My Account</h2>

      {welcome && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          Welcome to {layoutData.business.businessName}! Your account has been created.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
        <AccountProfileForm
          name={full?.name ?? ""}
          email={full?.email ?? ""}
          phone={full?.phone ?? ""}
          address={full?.address ?? ""}
        />

        <div id="orders" className="bg-white rounded-lg border border-storefront-border p-5">
          <h5 className="font-bold mb-3">My Orders</h5>
          {orders.length === 0 ? (
            <p className="text-storefront-muted text-sm">
              You haven&apos;t placed any orders yet. <Link href="/shop" className="text-storefront-green font-medium">Start shopping</Link>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-storefront-border text-left">
                    <th className="py-2">Order #</th>
                    <th className="py-2">Date</th>
                    <th className="py-2">Total</th>
                    <th className="py-2">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: (typeof orders)[number]) => (
                    <tr key={o.id} className="border-b border-storefront-border">
                      <td className="py-2">{o.orderNumber}</td>
                      <td className="py-2">{o.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="py-2">₹{Number(o.totalAmount).toFixed(2)}</td>
                      <td className="py-2">
                        <span className="bg-sky-100 text-sky-700 text-xs font-semibold rounded px-2 py-1">{o.orderStatus}</span>
                      </td>
                      <td className="py-2">
                        <Link href={`/shop/order?id=${o.id}`} className="text-xs border border-storefront-green text-storefront-green-dark font-medium rounded px-3 py-1.5">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ShopLayout>
  );
}
