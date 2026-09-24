import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { searchPublishedPosts } from "@/lib/push-manager2";

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "send")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const posts = await searchPublishedPosts(q);
  return NextResponse.json({ success: true, posts });
}
