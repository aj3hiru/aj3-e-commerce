"use client";

import { useState } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";
import { SelectEnhancer } from "./SelectEnhancer";
import { DeniedNotice } from "./DeniedNotice";

interface AdminShellProps {
  siteName: string;
  pageTitle: string;
  pageSubtitle?: string;
  username: string;
  role: string;
  permissions: Record<string, Record<string, boolean>>;
  /** Optional controls rendered in the header's right-hand group, before the
   *  search box — used by the dashboard for its range filter and Display
   *  Options. Omitted everywhere else, so no other page changes. */
  headerActions?: React.ReactNode;
  /** Show the header search box. The PHP includes global-search.php on the
   *  dashboard and billing screens only, so it is opt-in per page. */
  showSearch?: boolean;
  children: React.ReactNode;
}

/**
 * Mirrors the original .admin-container CSS grid (280px sidebar + 1fr content
 * on desktop, single column with an off-canvas sidebar on mobile) defined in
 * admin/ecommerce/components/ecom-head.php / assets/css/admin-shell.css.
 */
export function AdminShell({ siteName, pageTitle, pageSubtitle, username, role, permissions, headerActions, showSearch, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-ui grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-screen bg-admin-gray-50">
      <AdminSidebar
        siteName={siteName}
        permissions={permissions}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      {/* Pinned to the content column so it can never slide into the
          sidebar's 280px column, even for a moment while the sidebar loads. */}
      <main className="min-w-0 lg:col-start-2">
        <AdminHeader
          siteName={siteName}
          pageTitle={pageTitle}
          pageSubtitle={pageSubtitle}
          username={username}
          role={role}
          headerActions={headerActions}
          showSearch={showSearch}
          onMenuToggle={() => setSidebarOpen((o) => !o)}
        />
        <div className="mx-auto max-w-[1600px] p-4 min-[641px]:p-6">
          <DeniedNotice />
          {children}
        </div>
      </main>
      {/* Every dropdown opens the admin's own list, not the browser pop-up. */}
      <SelectEnhancer />
    </div>
  );
}
