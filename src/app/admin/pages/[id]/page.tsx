import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageForm } from "@/components/admin/PageForm";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

interface EditPagePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPagePage({ params }: EditPagePageProps) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "pages", "edit")) {
    redirect("/shop/login");
  }

  const { id } = await params;
  const pageId = Number(id);
  if (!Number.isInteger(pageId)) notFound();

  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) notFound();

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="Edit Page"
      pageSubtitle={page.title}
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <PageForm
        initial={{
          id: page.id, title: page.title, slug: page.slug, content: page.content,
          metaTitle: page.metaTitle ?? "", metaDescription: page.metaDescription ?? "",
          status: page.status as "draft" | "published",
        }}
      />
    </AdminShell>
  );
}
