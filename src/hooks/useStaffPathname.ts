"use client";

import { usePathname } from "next/navigation";

/**
 * The internal path ("/admin/…", "/agent/…") whether the page was opened by
 * it or by the clean URL on the admin / delivery host ("/ecommerce/orders").
 */
export function useStaffPathname(app: "admin" | "agent"): string {
  const p = usePathname() ?? "/";
  if (app === "admin") {
    if (p === "/") return "/admin/dashboard";
    return /^\/(admin|push-notifications)(\/|$)/.test(p) ? p : `/admin${p}`;
  }
  if (/^\/agent(\/|$)/.test(p)) return p;
  return p === "/" ? "/agent" : `/agent${p}`;
}
