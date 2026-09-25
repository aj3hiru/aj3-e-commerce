import { NextResponse } from "next/server";
import { appSession } from "@/lib/app-api";
import { appDashboard } from "@/lib/app-dashboard";
import { withApiErrors } from "@/lib/api-errors";

async function handleGET() {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  return NextResponse.json({ success: true, dashboard: await appDashboard(s) });
}

export const GET = withApiErrors(handleGET);
