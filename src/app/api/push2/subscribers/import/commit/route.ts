import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { commitImportChunk, finishImport, ImportError } from "@/lib/push-import";

/** Step 2 of an import: writes the next chunk of the server's own verified rows
 *  for this token and returns cumulative progress. Call until `done`. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ success: false, error: "Missing import token." }, { status: 400 });
  try {
    const progress = await commitImportChunk(token, session.userId, Number(body.size) || 250);
    if (progress.done) {
      const f = finishImport(token, session.userId);
      await logActivity(req, session.userId, "push_subscribers_import",
        `Imported push subscribers from ${f.fileName}: ${f.added} added, ${f.updated} updated, ${f.unchanged} unchanged`);
    }
    return NextResponse.json({ success: true, ...progress });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("push2 import commit failed", e);
    return NextResponse.json({ success: false, error: "This chunk couldn't be saved. Rows already imported are kept — you can retry." }, { status: 500 });
  }
}
