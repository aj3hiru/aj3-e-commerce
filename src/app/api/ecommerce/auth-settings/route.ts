import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveAuthSettings } from "@/lib/auth-settings";

/** Settings → Login & OTP. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ success: false, message: "Invalid data." }, { status: 400 });
  try {
    const settings = await saveAuthSettings(body);
    await logActivity(req, session.userId, "auth_settings_update", `Login settings: OTP ${settings.otpEnabled ? "on" : "off"}, password login ${settings.passwordLogin ? "on" : "off"}`);
    return NextResponse.json({ success: true, settings });
  } catch (e) {
    console.error("auth settings save failed", e);
    return NextResponse.json({ success: false, message: "Couldn't save — please try again." }, { status: 500 });
  }
}
