import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { withApiErrors } from "@/lib/api-errors";
import { searchVariantCandidates } from "@/lib/product-variants";

/** Add Product → Variants: find products to link (name / ID / barcode / SKU, brand and category filters). */
async function handleGET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const n = (k: string) => (/^\d+$/.test(sp.get(k) ?? "") ? Number(sp.get(k)) : null);
  const items = await searchVariantCandidates({ q: (sp.get("q") ?? "").slice(0, 100), brandId: n("brand"), categoryId: n("category"), exclude: n("exclude") });
  return NextResponse.json({ success: true, items });
}

export const GET = withApiErrors(handleGET);
