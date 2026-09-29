import { NextResponse } from "next/server";
import { getBusinessRow } from "@/lib/business-row";

/** The browser tab icon: the business logo from Business Settings (none yet → an empty answer, not a 404). */
export async function GET(req: Request) {
  const logo = (await getBusinessRow().catch(() => null))?.logo;
  if (!logo) return new Response(null, { status: 204, headers: { "Cache-Control": "public, max-age=3600" } });
  const target = /^https:/.test(logo) ? logo : new URL(`/${logo.replace(/^\/+/, "")}`, req.url).pathname;
  return new NextResponse(null, { status: 307, headers: { Location: target, "Cache-Control": "public, max-age=3600" } });
}
