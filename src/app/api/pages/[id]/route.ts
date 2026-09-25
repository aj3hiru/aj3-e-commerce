import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { withApiErrors } from "@/lib/api-errors";

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "pages", "edit")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const pageId = Number(id);
  const body = await req.json().catch(() => ({}));

  const title = (body.title ?? "").trim();
  const content = (body.content ?? "").trim();
  const metaTitle = (body.metaTitle ?? "").trim();
  const metaDescription = (body.metaDescription ?? "").trim();
  const status = body.status === "draft" ? "draft" : "published";

  if (!title) return NextResponse.json({ success: false, message: "Title is required." }, { status: 400 });

  const baseSlug = generateSlug(body.slug || title);
  const slug = await makeUniqueSlug(baseSlug, async (s) => !!(await prisma.page.findFirst({ where: { slug: s, id: { not: pageId } } })));

  await prisma.page.update({
    where: { id: pageId },
    data: { title, slug, content, metaTitle: metaTitle || null, metaDescription: metaDescription || null, status },
  });

  await logActivity(req, session.userId, "page_update", `Updated Page: ${title} (ID: ${pageId})`);

  return NextResponse.json({ success: true, redirect: "/admin/pages?success=updated" });
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "pages", "delete")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const pageId = Number(id);

  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { title: true } });
  await prisma.page.delete({ where: { id: pageId } });
  await logActivity(req, session.userId, "page_delete", `Deleted Page: ${page?.title ?? "Unknown"} (ID: ${pageId})`);

  return NextResponse.json({ success: true, redirect: "/admin/pages?success=deleted" });
}

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
