import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";
import { withApiErrors } from "@/lib/api-errors";

async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "pages", "create")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const title = (body.title ?? "").trim();
  const content = (body.content ?? "").trim();
  const metaTitle = (body.metaTitle ?? "").trim();
  const metaDescription = (body.metaDescription ?? "").trim();
  const status = body.status === "draft" ? "draft" : "published";

  if (!title) return NextResponse.json({ success: false, message: "Title is required." }, { status: 400 });

  const baseSlug = generateSlug(body.slug || title);
  const slug = await makeUniqueSlug(baseSlug, async (s) => !!(await prisma.page.findFirst({ where: { slug: s } })));

  const created = await prisma.page.create({
    data: { title, slug, content, metaTitle: metaTitle || null, metaDescription: metaDescription || null, status },
  });

  await logActivity(req, session.userId, "page_create", `Created Page: ${title} (ID: ${created.id})`);

  return NextResponse.json({ success: true, redirect: "/admin/pages?success=created" });
}

export const POST = withApiErrors(handlePOST);
