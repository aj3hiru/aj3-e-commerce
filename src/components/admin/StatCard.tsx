import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  green: "#1cc88a",
  blue: "#4361ee",
  red: "#e74a5b",
  cyan: "#36b9cc",
  orange: "#f6c23e",
};

interface StatCardProps {
  color: keyof typeof COLORS;
  icon: LucideIcon;
  label: string;
  value: string;
  widgetKey: string;
  href?: string;
}

/** Verified against the statCard() PHP helper in dashboard.php — same color map,
 *  same corner-circle decoration, same clickable-card-becomes-a-link behavior. */
export function StatCard({ color, icon: Icon, label, value, widgetKey, href }: StatCardProps) {
  const bg = COLORS[color] ?? COLORS.blue;
  const content = (
    <div
      className={cn(
        // .stat-card-e — note the shadow is the heavy card shadow
        // (0 .15rem 1.75rem 0 rgba(58,59,69,.1)), not Tailwind's shadow-sm.
        "relative flex h-full items-center gap-4 overflow-hidden rounded-[0.5rem] border border-black/[0.08] bg-white p-5 shadow-card",
        // .stat-card-e-clickable
        href && "transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_0.5rem_1.5rem_rgba(58,59,69,.15)]"
      )}
    >
      <div
        aria-hidden
        className="absolute -top-[30px] -right-[30px] w-[100px] h-[100px] rounded-full opacity-[0.08]"
        style={{ background: bg }}
      />
      <div
        className="w-[52px] h-[52px] rounded-[0.5rem] flex items-center justify-center text-white shrink-0"
        style={{ background: bg }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        {/* .stat-label-e / .stat-value-e */}
        <div className="mb-[0.2rem] text-[0.875rem] text-admin-gray-500">{label}</div>
        <div className="text-[1.375rem] font-bold text-admin-gray-900">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="col-span-1" data-widget={widgetKey}>
      {href ? (
        <Link href={href} className="block h-full no-underline">
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}
