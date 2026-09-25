import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { analyzeImport, ImportError } from "@/lib/push-import";
import { withApiErrors } from "@/lib/api-errors";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 100_000;

/** Step 1 of an import: upload a CSV/JSON file; every row is verified and
 *  compared with the database. Nothing is written — the response is a report
 *  plus a one-time token for /commit. */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ success: false, error: "Choose a CSV or JSON file to import." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: "File is too large (max 10MB)." }, { status: 400 });
  try {
    const analysis = await analyzeImport(await file.text(), file.name, session.userId, MAX_ROWS);
    return NextResponse.json({ success: true, ...analysis });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error("push2 import analyze failed", e);
    return NextResponse.json({ success: false, error: "Couldn't check this file. Please try again." }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
