import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { HEADER_SETTING_DEFAULTS, type HeaderSettingKey } from "@/lib/header-settings";
import { withApiErrors } from "@/lib/api-errors";

/** Store Customizer → Header & Menus → Header strip (address block, opening time, search box). */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ success: false, message: "Invalid settings." }, { status: 400 });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const values: Record<HeaderSettingKey, string> = {
    show_location: b.showLocation ? "1" : "0",
    show_delivery_info: b.showDeliveryInfo ? "1" : "0",
    delivery_label: str(b.deliveryLabel, 60) || HEADER_SETTING_DEFAULTS.delivery_label,
    // Blank is meaningful: the header then falls back to the business hours.
    delivery_time_text: str(b.deliveryTimeText, 60),
    search_placeholder: str(b.searchPlaceholder, 80) || HEADER_SETTING_DEFAULTS.search_placeholder,
  };
  try {
    await prisma.$transaction((Object.entries(values) as [HeaderSettingKey, string][]).map(([settingKey, settingValue]) =>
      prisma.ecomHomeSetting.upsert({ where: { settingKey }, update: { settingValue }, create: { settingKey, settingValue } })));
  } catch {
    return NextResponse.json({ success: false, message: "The header settings couldn't be saved." }, { status: 500 });
  }
  await logActivity(req, session.userId, "header_settings_update", "Updated the storefront header strip").catch(() => {});
  return NextResponse.json({
    success: true,
    header: { showLocation: values.show_location === "1", showDeliveryInfo: values.show_delivery_info === "1", deliveryLabel: values.delivery_label, deliveryTimeText: values.delivery_time_text, searchPlaceholder: values.search_placeholder },
  });
}

export const POST = withApiErrors(handlePOST);
