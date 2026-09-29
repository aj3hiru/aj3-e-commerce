import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { receiveChunk, startValidate } from "@/lib/backup";
import { withApiErrors } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/** Upload a backup file in small pieces (so big files never time out). The last piece starts the safety scan. */
async function handlePOST(req: NextRequest) {
  const s = await getAdminSession();
  if (!s || s.role !== "admin") return NextResponse.json({ success: false, message: "Only an Admin can do this." }, { status: 403 });
  const h = req.headers;
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length > 8 * 1024 * 1024) return NextResponse.json({ success: false, message: "Piece too large." }, { status: 413 });
  try {
    const name = await receiveChunk(h.get("x-upload-id") ?? "", Number(h.get("x-chunk")), Number(h.get("x-chunks")), data, decodeURIComponent(h.get("x-file-name") ?? "backup.tar.gz"));
    if (!name) return NextResponse.json({ success: true, done: false });
    return NextResponse.json({ success: true, done: true, file: name, job: startValidate(name).id });
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}

export const POST = withApiErrors(handlePOST);
