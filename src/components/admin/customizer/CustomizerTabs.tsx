"use client";

import Link from "next/link";
import { Home, Package, PanelBottom, PanelTop } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptionalWidgetVisible } from "@/hooks/useDashboardWidgetPrefs";

const ICONS = { home: Home, product: Package, header: PanelTop, footer: PanelBottom } as const;

/** Store Customizer section tabs (Homepage · Product Page · Header & Menus · Footer). */
export function CustomizerTabs({ tab, tabs }: { tab: string; tabs: { key: keyof typeof ICONS; label: string; hint: string }[] }) {
  const show = useOptionalWidgetVisible();
  const icons = show("cz-tabs") && show("cz-t-icons");
  const hints = show("cz-tabs") && show("cz-t-hints");
  return (
    <nav className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Customizer sections">
      {tabs.map((t) => {
        const Icon = ICONS[t.key];
        const active = t.key === tab;
        return (
          <Link key={t.key} href={`/admin/customizer?tab=${t.key}`} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-xl border px-3.5 transition", hints ? "py-3" : "py-2.5",
              active ? "border-admin-primary bg-admin-primary text-white shadow-md" : "border-admin-gray-200 bg-white text-admin-gray-700 hover:border-admin-primary/50")}>
            {icons && <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", active ? "bg-white/20" : "bg-admin-primary-lighter text-admin-primary")}><Icon className="h-[18px] w-[18px]" /></span>}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{t.label}</span>
              {hints && <span className={cn("block truncate text-xs", active ? "text-white/80" : "text-admin-gray-500")}>{t.hint}</span>}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
