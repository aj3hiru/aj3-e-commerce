"use client";

import { useState } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";

interface AdminShellProps {
  siteName: string;
  pageTitle: string;
  pageSubtitle?: string;
  username: string;
  role: string;
  permissions: Record<string, Record<string, boolean>>;
  children: React.ReactNode;
}

/**
 * Mirrors the original .admin-container CSS grid (280px sidebar + 1fr content
 * on desktop, single column with an off-canvas sidebar on mobile) defined in
 * admin/ecommerce/components/ecom-head.php / assets/css/admin-shell.css.
 */
export function AdminShell({ siteName, pageTitle, pageSubtitle, username, role, permissions, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-screen bg-admin-gray-50">
      <AdminSidebar
        siteName={siteName}
        permissions={permissions}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="min-w-0">
        <AdminHeader
          siteName={siteName}
          pageTitle={pageTitle}
          pageSubtitle={pageSubtitle}
          username={username}
          role={role}
          onMenuToggle={() => setSidebarOpen((o) => !o)}
        />
        <div className="p-6 max-w-admin-content mx-auto sm:p-4">
          {children}
        </div>
      </main>
    </div>
  );
}
