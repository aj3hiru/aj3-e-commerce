import { NextRequest, NextResponse } from "next/server";
import { categoryPicks, searchSuggest } from "@/lib/shop-suggest";
import { withApiErrors } from "@/lib/api-errors";

/** GET ?q=… live search suggestions · GET ?cat=slug a category's products (Categories sheet). */
async function handleGET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cat = sp.get("cat");
  const headers = { "Cache-Control": "public, max-age=30" };
  if (cat) return NextResponse.json({ products: await categoryPicks(cat.slice(0, 120)) }, { headers });
  return NextResponse.json(await searchSuggest(sp.get("q") ?? ""), { headers });
}

export const GET = withApiErrors(handleGET);
