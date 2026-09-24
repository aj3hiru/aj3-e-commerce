import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { importSubscriptions, parseSubscriptionFile } from "@/lib/push-subscriptions";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 100_000;

/** Imports subscribers from a CSV or JSON file (this page's own export, or the
 *  old PHP table's `subscription` JSON column). Upserts by endpoint. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ success: false, error: "Choose a CSV or JSON file to import." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: "File is too large (max 10MB)." }, { status: 400 });

  let parsed: ReturnType<typeof parseSubscriptionFile>;
  try {
    parsed = parseSubscriptionFile(await file.text());
  } catch {
    return NextResponse.json({ success: false, error: "Couldn't read this file — it isn't valid CSV or JSON." }, { status: 400 });
  }
  if (parsed.rows.length === 0) return NextResponse.json({ success: false, error: "No rows found in this file." }, { status: 400 });
  if (parsed.rows.length > MAX_ROWS) return NextResponse.json({ success: false, error: `Too many rows (max ${MAX_ROWS.toLocaleString("en-US")}).` }, { status: 400 });

  try {
    const result = await importSubscriptions(parsed.rows);
    await logActivity(req, session.userId, "push_subscribers_import",
      `Imported push subscribers from ${file.name}: ${result.added} added, ${result.updated} updated, ${result.invalid} invalid`);
    return NextResponse.json({ success: true, format: parsed.format, ...result });
  } catch (e) {
    console.error("push2 subscriber import failed", e);
    return NextResponse.json({ success: false, error: "Import failed part-way. Rows already saved are kept — please try again." }, { status: 500 });
  }
}
