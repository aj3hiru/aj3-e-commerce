import { NextResponse } from "next/server";
import { appSession } from "@/lib/app-api";
import { ADMIN_NAV, hasPermission } from "@/lib/admin-nav-config";
import { withApiErrors } from "@/lib/api-errors";

/**
 * The website's admin menu for this person (same sections, links, submenus,
 * labels and Font Awesome icon names, filtered by their permissions), so the
 * staff app shows exactly what the website sidebar shows.
 */
async function handleGET() {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  const p = s.permissions;
  const link = (l: { href: string; label: string; icon: { iconName: string }; isLogout?: boolean }) => ({ href: l.href, label: l.label, icon: l.icon.iconName, logout: !!l.isLogout });
  const sections = ADMIN_NAV.filter((sec) => hasPermission(p, sec.permission))
    .map((sec) => ({
      title: sec.title,
      links: sec.links
        .filter((l) => hasPermission(p, l.permission))
        .map((l) => ({ ...link(l), toggleOnly: !!l.toggleOnly, submenu: (l.submenu ?? []).filter((sub) => hasPermission(p, sub.permission)).map(link) }))
        .filter((l) => !l.toggleOnly || l.submenu.length > 0),
    }))
    .filter((sec) => sec.links.length > 0);
  return NextResponse.json({ success: true, menu: sections });
}

export const GET = withApiErrors(handleGET);
