import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { saveUploadedImage } from "@/lib/upload";

/** Profile photo upload for staff (own photo, or anyone's for user managers). Returns the saved path. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ success: false, message: "Choose a photo." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ success: false, message: "Photo is too large (max 5 MB)." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, path: await saveUploadedImage(file, "staff", "avatar") });
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}
