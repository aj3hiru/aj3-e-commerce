import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { parseProductFilters, searchPushProducts } from "@/lib/push-catalog";
import { withApiErrors } from "@/lib/api-errors";

/** Product picker for Compose: search + category/subcategory/brand/stock/sale/price filters, sorted and paginated. */
async function handleGET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "push_notifications", "send")) {
    return NextResponse.json({ success: false, error: "Access Denied" }, { status: 403 });
  }
  try {
    const result = await searchPushProducts(parseProductFilters(req.nextUrl.searchParams));
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("push2 product search failed", e);
    return NextResponse.json({ success: false, error: "Couldn't load products." }, { status: 500 });
  }
}

export const GET = withApiErrors(handleGET);
