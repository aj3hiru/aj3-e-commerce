"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, House, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** The delivery agent app frame: Meesho-style header and a bottom tab bar (Today · History · Profile). */
export function AgentShell({ name, avatar, store, children }: { name: string; avatar: string | null; store: string; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const tabs = [
    { href: "/agent", label: "Today", icon: House, on: path === "/agent" || path.startsWith("/agent/order") },
    { href: "/agent/history", label: "History", icon: History, on: path.startsWith("/agent/history") },
    { href: "/agent/profile", label: "Profile", icon: UserRound, on: path.startsWith("/agent/profile") },
  ];
  return (
    <div className="min-h-screen bg-[#f5f5f8] pb-[76px] font-storefront text-[#353543]" style={{ ["--hp-accent" as string]: "#9f2089" }}>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-white px-4 shadow-[0_1px_0_#eaeaf2]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-extrabold text-[var(--hp-accent)]">{store}</p>
          <p className="-mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b8ba3]">Delivery Partner</p>
        </div>
        <Link href="/agent/profile" aria-label="Profile" className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--hp-accent)_12%,white)] font-bold text-[var(--hp-accent)] ring-2 ring-white">
          {avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/${avatar}`} alt="" className="h-full w-full object-cover" />
            : name.charAt(0).toUpperCase()}
        </Link>
      </header>
      <main className="mx-auto max-w-[640px]">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#eaeaf2] bg-white pb-[env(safe-area-inset-bottom)]">
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
