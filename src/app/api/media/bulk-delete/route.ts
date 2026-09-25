import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { withApiErrors } from "@/lib/api-errors";

async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "files", "access_file_manager")) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length === 0) return NextResponse.json({ error: "No IDs" }, { status: 400 });

  const rows = await prisma.media.findMany({ where: { id: { in: ids } } });
  await prisma.media.deleteMany({ where: { id: { in: ids } } });

  for (const row of rows) {
    try {
      await unlink(path.join(process.cwd(), "public", row.filePath));
    } catch { /* best-effort */ }
  }

  await logActivity(req, session.userId, "media_bulk_delete", `Bulk deleted ${rows.length} file(s)`);

  return NextResponse.json({ success: true, deleted: rows.length });
}

export const POST = withApiErrors(handlePOST);
