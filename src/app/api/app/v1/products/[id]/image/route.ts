import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appSession } from "@/lib/app-api";
import { hasPermission } from "@/lib/admin-auth";
import { deleteUploadedImage, saveUploadedImage } from "@/lib/upload";
import { withApiErrors } from "@/lib/api-errors";

/** New main photo for a product from the staff app (multipart "image"); saved as WebP like every upload. */
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  if (!hasPermission(s.permissions, "ecommerce", "manage_products")) return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await prisma.ecomProduct.findUnique({ where: { id }, select: { image: true, slug: true } }) : null;
  if (!p) return NextResponse.json({ success: false, message: "This product no longer exists." }, { status: 404 });
  const file = (await req.formData()).get("image");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ success: false, message: "Choose a photo." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ success: false, message: "Photo is too large (8 MB max)." }, { status: 400 });
  let image: string;
  try {
    image = await saveUploadedImage(file, "ecommerce/products", p.slug);
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "Could not save the photo." }, { status: 400 });
  }
  await prisma.ecomProduct.update({ where: { id }, data: { image } });
  await deleteUploadedImage(p.image);
  return NextResponse.json({ success: true, image });
}

export const POST = withApiErrors(handlePOST);
