import { redirect } from "next/navigation";
import { DisplayOptionsShell } from "@/components/admin/DisplayOptionsShell";
import { PAGE_EDITOR_GROUPS, PAGE_EDITOR_PREF_KEY } from "@/components/admin/pages-display";
import { PageForm } from "@/components/admin/PageForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

export default async function NewPagePage() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "pages", "create")) {
    redirect("/staff/login");
  }

  return (
    <DisplayOptionsShell prefKey={PAGE_EDITOR_PREF_KEY} groups={PAGE_EDITOR_GROUPS}
      siteName="EduMint24"
      pageTitle="Add Page"
      pageSubtitle="Create a new static content page"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <PageForm initial={null} />
    </DisplayOptionsShell>
  );
}
