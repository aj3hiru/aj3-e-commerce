import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

async function clearApplicationCache() {
  "use server";
  revalidatePath("/", "layout");
  revalidatePath("/shop", "layout");
  revalidatePath("/admin/dashboard", "page");
}

export default async function CacheManagerPage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "settings", "maintenance_mode")) redirect("/shop/login");
  return (
    <AdminShell siteName="EduMint24" pageTitle="Cache Manager" pageSubtitle="Refresh cached application pages safely" username={session.username} role={session.role} permissions={session.permissions}>
      <div className="max-w-2xl bg-white border border-admin-gray-200 rounded-lg p-6">
        <h2 className="font-bold text-lg mb-2">Application cache</h2>
        <p className="text-sm text-admin-gray-600 mb-5">Use this action after changing homepage, catalog, or business settings. It refreshes Next.js page caches without touching uploads or database records.</p>
        <form action={clearApplicationCache}>
          <button className="bg-admin-primary hover:bg-admin-primary-dark text-white rounded px-4 py-2.5 text-sm font-medium">Clear application cache</button>
        </form>
      </div>
    </AdminShell>
  );
}
