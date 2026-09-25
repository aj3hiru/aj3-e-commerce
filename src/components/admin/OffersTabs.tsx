import Link from "next/link";
import { BadgePercent, TicketPercent } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Offers & Coupons: the two kinds of discount side by side, one tab each.
 *  - Campaign Offers: prices drop by themselves for a time (no code).
 *  - Coupons: a code the customer types at checkout.
 */
export function OffersTabs({ active, canCampaigns, canCoupons }: { active: "campaigns" | "coupons"; canCampaigns: boolean; canCoupons: boolean }) {
  const tabs = [
    canCampaigns && { key: "campaigns", href: "/admin/ecommerce/campaign-offer", label: "Campaign Offers", hint: "Automatic price drops — no code needed", icon: BadgePercent },
    canCoupons && { key: "coupons", href: "/admin/ecommerce/coupons", label: "Coupons", hint: "Codes customers enter at checkout", icon: TicketPercent },
  ].filter(Boolean) as { key: string; href: string; label: string; hint: string; icon: typeof BadgePercent }[];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Offers & Coupons" className="mb-5 grid grid-cols-2 gap-2 sm:max-w-[640px]">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-[10px] border px-3.5 py-3 transition",
              on ? "border-[#2563eb] bg-blue-50 text-[#1d4ed8] shadow-sm" : "border-admin-gray-200 bg-white text-admin-gray-700 hover:border-admin-gray-300")}>
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[8px]", on ? "bg-[#2563eb] text-white" : "bg-admin-gray-100 text-admin-gray-500")}>
              <t.icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{t.label}</span>
              <span className={cn("block truncate text-xs", on ? "text-[#1d4ed8]/75" : "text-admin-gray-500")}>{t.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
