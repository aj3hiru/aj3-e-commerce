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
        "relative flex items-center gap-4 h-full overflow-hidden rounded-lg border border-black/[0.08] bg-white p-5 shadow-sm",
        href && "transition-transform hover:-translate-y-0.5 hover:shadow-md"
      )}
    >
      <div
        aria-hidden
        className="absolute -top-[30px] -right-[30px] w-[100px] h-[100px] rounded-full opacity-[0.08]"
        style={{ background: bg }}
      />
      <div
        className="w-[52px] h-[52px] rounded-lg flex items-center justify-center text-white shrink-0"
        style={{ background: bg }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-sm text-admin-gray-500 mb-0.5">{label}</div>
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
