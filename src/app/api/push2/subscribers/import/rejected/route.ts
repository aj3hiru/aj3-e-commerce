import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { ImportError, rejectedCsv } from "@/lib/push-import";

/** Downloads every row an import rejected, with the reason, as CSV. */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "manage_templates")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  try {
    const { csv, fileName } = rejectedCsv(req.nextUrl.searchParams.get("token") ?? "", session.userId);
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    throw e;
  }
}
