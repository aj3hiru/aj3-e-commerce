import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveStorefrontConfig } from "@/lib/storefront-config";

/** Saves Business Settings → Header Menu / Sidebar Menu / Menu Design /
 *  Push Notifications / Footer. Same permission as the rest of Business Settings. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ success: false, message: "Invalid data." }, { status: 400 });
  try {
    const config = await saveStorefrontConfig(body);
    await logActivity(req, session.userId, "storefront_settings_update",
      `Updated storefront menus/footer (${config.headerMenu.length} header, ${config.sidebarMenu.length} sidebar items)`);
    return NextResponse.json({ success: true, config });
  } catch (e) {
    console.error("storefront config save failed", e);
    return NextResponse.json({ success: false, message: "Menus & footer couldn't be saved — the storefront_settings table may be missing." }, { status: 500 });
  }
}
