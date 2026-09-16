import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export default async function PushManagerPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "send")) redirect("/shop/login");
  const [subscriptions, campaigns] = await Promise.all([
    prisma.pushSubscription.count(),
    prisma.pushCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <AdminShell siteName="EduMint24" pageTitle="Push Notifications" pageSubtitle="Manage subscriber reach and notification campaigns" username={session.username} role={session.role} permissions={session.permissions}>
      <div className="grid md:grid-cols-3 gap-4 mb-5">
        <div className="bg-white border border-admin-gray-200 rounded-lg p-5"><div className="text-2xl font-bold">{subscriptions}</div><div className="text-sm text-admin-gray-500">Subscribers</div></div>
        <div className="bg-white border border-admin-gray-200 rounded-lg p-5"><div className="text-2xl font-bold">{campaigns.length}</div><div className="text-sm text-admin-gray-500">Recent campaigns</div></div>
      </div>
      <div className="bg-white border border-admin-gray-200 rounded-lg p-5">
        <h2 className="font-bold text-lg mb-3">Campaigns</h2>
        {campaigns.length === 0 ? <p className="text-sm text-admin-gray-500">No push campaigns have been created yet.</p> : <div className="divide-y">{campaigns.map(c => <div key={c.id} className="py-3 flex items-center justify-between"><div><div className="font-medium">{c.title}</div><div className="text-xs text-admin-gray-500">{c.body}</div></div><span className="text-xs rounded bg-admin-gray-100 px-2 py-1">{c.status}</span></div>)}</div>}
      </div>
    </AdminShell>
  );
}
