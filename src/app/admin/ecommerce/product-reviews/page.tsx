import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ReviewsTable } from "@/components/admin/ReviewsTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface ProductReviewsPageProps {
  searchParams: Promise<{ success?: string }>;
}

export default async function ProductReviewsPage({ searchParams }: ProductReviewsPageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    redirect("/shop/login");
  }
  const params = await searchParams;

  const reviews = await prisma.ecomProductReview.findMany({
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const totalPending = reviews.filter((r: (typeof reviews)[number]) => r.status === "pending").length;

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Product Reviews"
      pageSubtitle="Moderate customer reviews left on your products"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success === "deleted" && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          Review deleted successfully!
        </div>
      )}
      {totalPending > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded px-4 py-2.5 mb-4">
          {totalPending} review{totalPending === 1 ? "" : "s"} awaiting moderation.
        </div>
      )}

      <ReviewsTable
        reviews={reviews.map((r: (typeof reviews)[number]) => ({
          id: r.id,
          productName: r.product?.name ?? "Unknown Product",
          rating: r.rating,
          reviewText: r.reviewText,
          customerName: r.customerName,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </AdminShell>
  );
}
