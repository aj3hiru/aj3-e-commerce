import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { clearCacheSection, type CacheSection } from "@/lib/cache-manager2";
import { withApiErrors } from "@/lib/api-errors";

const VALID: CacheSection[] = ["home", "shop", "blog", "dashboard", "all", "redis"];

async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "settings", "maintenance_mode")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const section = body.section as CacheSection;
  if (!VALID.includes(section)) return NextResponse.json({ success: false, message: "Invalid section." }, { status: 400 });

  try {
    const result = await clearCacheSection(section, req, session.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("cache clear failed", section, e);
    return NextResponse.json({ success: false, message: "Could not clear the cache. Please try again." }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
