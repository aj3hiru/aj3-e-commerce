import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";

const DEMO_PERMISSIONS = {
  ecommerce: {
    manage_billing: true,
    manage_products: true,
    manage_categories: true,
    manage_orders: true,
    manage_customers: true,
    manage_coupons: true,
    manage_payment: true,
    manage_credits: true,
  },
  files: { access_file_manager: true },
  push_notifications: { send: true },
  blogs: { manage_categories: true, manage_tags: true, manage_comments: true },
  analytics: { view_basic: true },
  settings: { maintenance_mode: true },
  security: { view_logs: true },
  users: { create: true },
};

export default function DemoAdminDashboard() {
  // UI preview with fake data — local development only, never on the live site.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Dashboard"
      pageSubtitle="Welcome back — here's what's happening"
      username="manish"
      role="admin"
      permissions={DEMO_PERMISSIONS}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-admin-gray-200 p-5 shadow-sm">
          <div className="text-2xl font-bold text-admin-gray-900">₹42,500</div>
          <div className="text-sm text-admin-gray-500 mt-1">Today&apos;s Sales</div>
        </div>
        <div className="bg-white rounded-lg border border-admin-gray-200 p-5 shadow-sm">
          <div className="text-2xl font-bold text-admin-gray-900">128</div>
          <div className="text-sm text-admin-gray-500 mt-1">Orders</div>
        </div>
        <div className="bg-white rounded-lg border border-admin-gray-200 p-5 shadow-sm">
          <div className="text-2xl font-bold text-admin-gray-900">₹3,200</div>
          <div className="text-sm text-admin-gray-500 mt-1">Pending Due</div>
        </div>
      </div>
    </AdminShell>
  );
}
