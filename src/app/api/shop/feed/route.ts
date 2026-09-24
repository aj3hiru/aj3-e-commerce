import { NextRequest, NextResponse } from "next/server";
import { getShopFeed, parseFeedFilters } from "@/lib/shop-feed";

/** Public: next pages of the homepage "Products For You" feed (same filters as the URL). */
export async function GET(req: NextRequest) {
  try {
    const result = await getShopFeed(parseFeedFilters(req.nextUrl.searchParams));
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("shop feed failed", e);
    return NextResponse.json({ success: false, message: "Couldn't load products." }, { status: 500 });
  }
}
