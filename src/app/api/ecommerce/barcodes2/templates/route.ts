import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { getBarcodeTemplates, saveBarcodeTemplates } from "@/lib/barcode-templates";
import { withApiErrors } from "@/lib/api-errors";

/** Print Barcodes → saved label templates. POST { save: {id?, name, options} } or { remove: id }. */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  let list = await getBarcodeTemplates();
  if (body?.remove) list = list.filter((t) => t.id !== String(body.remove));
  else if (body?.save && typeof body.save.name === "string" && body.save.name.trim() && body.save.options && typeof body.save.options === "object") {
    const name = body.save.name.trim().slice(0, 60);
    const id = typeof body.save.id === "string" && list.some((t) => t.id === body.save.id) ? body.save.id
      : list.find((t) => t.name.toLowerCase() === name.toLowerCase())?.id ?? `t${Date.now().toString(36)}`;
    const t = { id, name, options: body.save.options, updatedAt: new Date().toISOString() };
    list = list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? t : x)) : [...list, t];
  } else {
    return NextResponse.json({ success: false, message: "Give the template a name." }, { status: 400 });
  }
  return NextResponse.json({ success: true, templates: await saveBarcodeTemplates(list) });
}

export const POST = withApiErrors(handlePOST);
