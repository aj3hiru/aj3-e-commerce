import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { AgentShell } from "@/components/agent/AgentShell";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { staffName } from "@/lib/staff";
import { roleLabel } from "@/lib/roles";

export const metadata: Metadata = { title: "Deliveries", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#9f2089" };

/** /agent — the delivery agent's app. Only delivery agents; everyone else goes to their own dashboard. */
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login?next=/agent");
  if (!session.permissions.delivery?.deliver) redirect("/admin/dashboard");
  const [u, biz] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { username: true, firstName: true, lastName: true, avatar: true } }),
    prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" }, select: { businessName: true } }),
  ]);
  const p = session.permissions;
  const adminLink = session.role === "admin" || !!p.orders?.view || !!p.ecommerce?.manage_billing || !!p.ecommerce?.manage_products;
  return (
    <AgentShell name={u ? staffName(u) : session.username} avatar={u?.avatar ?? null} store={biz?.businessName ?? "Store"} roleLabel={roleLabel(session.role)} adminLink={adminLink}>
      {children}
    </AgentShell>
  );
}
