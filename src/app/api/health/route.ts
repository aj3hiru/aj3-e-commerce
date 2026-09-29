import { NextResponse } from "next/server";

/** "Is the server reachable?" — the desktop app asks every few seconds (no database, no login). */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
