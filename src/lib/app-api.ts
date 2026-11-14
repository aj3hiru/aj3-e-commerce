import { NextResponse } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/admin-auth";

/** The signed-in staff member (website login), or a 401 answer — used by the admin's live updates (/api/app/v1/events). */
export async function appSession(): Promise<AdminSession | NextResponse> {
  const s = await getAdminSession();
  return s ?? NextResponse.json({ success: false, auth: false, message: "Please log in again." }, { status: 401 });
}
