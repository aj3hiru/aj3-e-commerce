import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveHome } from "@/lib/home-config";

/** Homepage Customizer: save the draft (autosave / preview) or publish it to the live homepage. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_homepage")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !body.config) return NextResponse.json({ success: false, message: "Invalid data." }, { status: 400 });
  const publish = body.action === "publish";
  try {
    const config = await saveHome(body.config, publish);
    if (publish) await logActivity(req, session.userId, "homepage_publish", `Published homepage (${config.blocks.length} blocks)`);
    return NextResponse.json({ success: true, config, published: publish });
  } catch (e) {
    console.error("home customizer save failed", e);
    return NextResponse.json({ success: false, message: "Couldn't save — please try again." }, { status: 500 });
  }
}
