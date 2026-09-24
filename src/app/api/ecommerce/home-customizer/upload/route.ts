import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { saveUploadedImage } from "@/lib/upload";

/** Image upload for the Homepage Customizer (banners, promo bar image). */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_homepage")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ success: false, message: "Choose an image." }, { status: 400 });
  try {
    const path = await saveUploadedImage(file, "ecommerce/homepage", "home");
    return NextResponse.json({ success: true, path });
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}
