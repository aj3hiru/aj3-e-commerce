"use client";

import Link from "next/link";
import { useStaffPathname } from "@/hooks/useStaffPathname";
import { History, House, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The delivery agent app frame. Phones: Meesho-style header + bottom tabs.
 * Computers: a left sidebar (profile, menu, admin-panel link for managers,
 * logout) and a wide content area.
 */
/** A plain link: on its own subdomain the admin panel is another host. */
const ADMIN_HOME = "/admin/dashboard";

export function AgentShell({ name, avatar, store, roleLabel, adminLink, children }: {
  name: string; avatar: string | null; store: string; roleLabel: string; adminLink: boolean; children: React.ReactNode;
}) {
  const path = useStaffPathname("agent");
  const tabs = [
    { href: "/agent", label: "Today", icon: House, on: path === "/agent" || path.startsWith("/agent/order") },
    { href: "/agent/history", label: "History", icon: History, on: path.startsWith("/agent/history") },
    { href: "/agent/profile", label: "Profile", icon: UserRound, on: path.startsWith("/agent/profile") },
  ];
  const face = (size: string) => (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--hp-accent)_12%,white)] font-bold text-[var(--hp-accent)] ring-2 ring-white", size)}>
      {avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`/${avatar}`} alt="" className="h-full w-full object-cover" />
        : name.charAt(0).toUpperCase()}
    </span>
  );
  return (
    <div className="min-h-screen bg-[#f5f5f8] pb-[76px] font-storefront text-[#353543] lg:pb-0 lg:pl-[260px]" style={{ ["--hp-accent" as string]: "#9f2089" }}>
      {/* Computer sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-[#eaeaf2] bg-white lg:flex">
        <div className="px-5 pb-4 pt-5">
          <p className="truncate text-[20px] font-extrabold text-[var(--hp-accent)]">{store}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8ba3]">Delivery Partner</p>
        </div>
        <div className="mx-4 flex items-center gap-3 rounded-xl bg-[#f8f9fe] p-3">
          {face("h-11 w-11 text-[17px]")}
          <div className="min-w-0"><p className="truncate text-[14.5px] font-semibold">{name}</p><p className="text-[12px] text-[#8b8ba3]">{roleLabel}</p></div>
        </div>
        <nav className="mt-4 flex-1 space-y-1 px-3">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} aria-current={t.on ? "page" : undefined}
              className={cn("relative flex h-11 items-center gap-3 rounded-[8px] px-3 text-[14.5px] transition", t.on ? "bg-[#fdf0f9] font-semibold text-[var(--hp-accent)]" : "text-[#616173] hover:bg-[#f8f9fe]")}>
              {t.on && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[var(--hp-accent)]" />}
              <t.icon className="h-5 w-5" strokeWidth={t.on ? 2.1 : 1.7} />{t.label}
            </Link>
          ))}
          {adminLink && (
            <a href={ADMIN_HOME} className="flex h-11 items-center gap-3 rounded-[8px] px-3 text-[14.5px] text-[#616173] hover:bg-[#f8f9fe]">
              <LayoutDashboard className="h-5 w-5" strokeWidth={1.7} />Admin panel
            </a>
          )}
        </nav>
        <form action="/api/auth/logout" method="POST" className="border-t border-[#eaeaf2] p-3">
          <button type="submit" className="flex h-11 w-full items-center gap-3 rounded-[8px] px-3 text-[14.5px] font-medium text-[#d0263a] hover:bg-[#fdecee]"><LogOut className="h-5 w-5" />Logout</button>
        </form>
      </aside>

      {/* Phone header */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-white px-4 shadow-[0_1px_0_#eaeaf2] lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-extrabold text-[var(--hp-accent)]">{store}</p>
          <p className="-mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8ba3]">Delivery Partner</p>
        </div>
        {adminLink && <a href={ADMIN_HOME} aria-label="Admin panel" className="grid h-10 w-10 place-items-center rounded-full text-[#616173] hover:bg-[#f5f5f8]"><LayoutDashboard className="h-5 w-5" /></a>}
        <Link href="/agent/profile" aria-label="Profile">{face("h-10 w-10")}</Link>
      </header>

      <main className="mx-auto max-w-[640px] lg:max-w-[1180px] lg:px-6 lg:py-4">{children}</main>

      {/* Phone tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#eaeaf2] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid h-[60px] max-w-[640px] grid-cols-3">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} aria-current={t.on ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11.5px]", t.on ? "font-semibold text-[var(--hp-accent)]" : "text-[#8b8ba3]")}>
              <t.icon className="h-6 w-6" strokeWidth={t.on ? 2.2 : 1.6} />{t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
