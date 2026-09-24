import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveProductPage } from "@/lib/product-page-config";

/** Customizer → Product Page: save the draft (autosave / preview) or publish it. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_homepage")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !body.config) return NextResponse.json({ success: false, message: "Invalid data." }, { status: 400 });
  const publish = body.action === "publish";
  try {
    const config = await saveProductPage(body.config, publish);
    if (publish) await logActivity(req, session.userId, "product_page_publish", "Published product page design");
    return NextResponse.json({ success: true, config, published: publish });
  } catch (e) {
    console.error("product page customizer save failed", e);
    return NextResponse.json({ success: false, message: "Couldn't save — please try again." }, { status: 500 });
  }
}
