import { redirect } from "next/navigation";
import { DisplayOptionsShell } from "@/components/admin/DisplayOptionsShell";
import { PAGES_GROUPS, PAGES_PREF_KEY } from "@/components/admin/pages-display";
import { PagesTable } from "@/components/admin/PagesTable";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface PagesListProps {
  searchParams: Promise<{ success?: string }>;
}

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Page created successfully!",
  updated: "Page updated successfully!",
  deleted: "Page deleted successfully!",
};

export default async function PagesListPage({ searchParams }: PagesListProps) {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  if (!hasPermission(session.permissions, "pages", "create")) redirect("/admin/dashboard?denied=1");
  const params = await searchParams;
  const pages = await prisma.page.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <DisplayOptionsShell
      prefKey={PAGES_PREF_KEY}
      groups={PAGES_GROUPS}
      siteName="EduMint24"
      pageTitle="Pages"
      pageSubtitle="Manage static content pages like About Us, Terms, and Privacy Policy"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      {params.success && SUCCESS_MESSAGES[params.success] && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">
          {SUCCESS_MESSAGES[params.success]}
        </div>
      )}
      <PagesTable
        pages={pages.map((p: (typeof pages)[number]) => ({
          id: p.id, title: p.title, slug: p.slug, status: p.status, updatedAt: p.updatedAt.toISOString(),
        }))}
      />
    </DisplayOptionsShell>
  );
}
