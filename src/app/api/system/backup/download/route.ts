import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { backupPath } from "@/lib/backup";
import { withApiErrors } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/** Streams a backup file to the Admin's computer. */
async function handleGET(req: NextRequest) {
  const s = await getAdminSession();
  if (!s || s.role !== "admin") return NextResponse.json({ success: false, message: "Only an Admin can do this." }, { status: 403 });
  const name = req.nextUrl.searchParams.get("file") ?? "";
  let file: string;
  try { file = backupPath(name); } catch { return NextResponse.json({ success: false, message: "Unknown backup file." }, { status: 400 }); }
  const st = await stat(file).catch(() => null);
  if (!st) return NextResponse.json({ success: false, message: "That backup no longer exists." }, { status: 404 });
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { "Content-Type": "application/gzip", "Content-Length": String(st.size), "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}

export const GET = withApiErrors(handleGET);
