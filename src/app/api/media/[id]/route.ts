import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "files", "access_file_manager")) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const mediaId = Number(id);
  const body = await req.json().catch(() => ({}));

  await prisma.media.update({
    where: { id: mediaId },
    data: {
      altText: (body.altText ?? "").trim(),
      title: (body.title ?? "").trim(),
      caption: (body.caption ?? "").trim() || null,
      description: (body.description ?? "").trim() || null,
    },
  });

  return NextResponse.json({ success: true });
}

/** Verified against delete_media — also removes the on-disk file (and any
 *  responsive-set variants) via a best-effort cleanup, matching fm_delete_media_row(). */
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "files", "access_file_manager")) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }
  const { id } = await params;
  const mediaId = Number(id);

  const row = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await prisma.media.delete({ where: { id: mediaId } });

    try {
      await unlink(path.join(process.cwd(), "public", row.filePath));
    } catch { /* best-effort */ }
    const responsiveSet = (row.responsiveSet as string[] | null) ?? [];
    for (const variant of responsiveSet) {
      try {
        await unlink(path.join(process.cwd(), "public", variant));
      } catch { /* best-effort */ }
    }

    const fname = row.filePath.split("/").pop();
    await logActivity(req, session.userId, "media_delete", `Deleted file: ${fname} (ID: ${mediaId})`);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete file." }, { status: 500 });
  }
}

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
