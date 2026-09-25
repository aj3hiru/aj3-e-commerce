import Link from "next/link";
import { ChevronRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderSummary } from "@/lib/customer-orders";
import { StatusPill, rupees } from "@/components/shop/ui/Meesho";

export const ORDER_STEPS = ["Pending", "In Progress", "Out for Delivery", "Delivered"];
export const STEP_LABEL: Record<string, string> = { Pending: "Ordered", "In Progress": "Processing", "Out for Delivery": "Out for Delivery", Delivered: "Delivered" };
export const fmtDate = (iso: string, time = false) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } : {}) });

/** Small four-dot progress line for an order card. */
function MiniTrack({ status }: { status: string }) {
  const at = ORDER_STEPS.indexOf(status);
  if (status === "Canceled" || at < 0) return null;
  return (
    <div className="mt-3">
      <div className="flex items-center">
        {ORDER_STEPS.map((s, i) => (
          <div key={s} className={cn("flex items-center", i > 0 && "flex-1")}>
            {i > 0 && <span className={cn("h-[3px] flex-1 rounded-full", i <= at ? "bg-[#038d63]" : "bg-[#e3e3ec]")} />}
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", i <= at ? "bg-[#038d63]" : "bg-[#dcdce6]")} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-[#8b8ba3]">
        {ORDER_STEPS.map((s, i) => <span key={s} className={cn(i === at && "font-semibold text-[#038d63]")}>{STEP_LABEL[s]}</span>)}
      </div>
    </div>
  );
}

export function OrderCard({ o }: { o: OrderSummary }) {
  const thumbs = o.items.slice(0, 3);
  return (
    <Link href={`/order?id=${o.id}`} className="mb-2 block bg-white px-4 py-4 transition active:bg-[#fafafc]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">Order #{o.number}</p>
          <p className="text-[12px] text-[#8b8ba3]">Placed on {fmtDate(o.date)}</p>
        </div>
        <StatusPill status={o.status} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex -space-x-3">
          {thumbs.map((t, i) => (
            <span key={i} className="h-14 w-14 overflow-hidden rounded-[6px] border-2 border-white bg-[#f5f5f8] shadow-sm">
              {t.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/${t.image}`} alt="" className="h-full w-full object-contain" />
                : <span className="grid h-full w-full place-items-center text-[#c9c9d6]"><ImageIcon className="h-5 w-5" /></span>}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] leading-[18px] text-[#616173]">{o.items.map((i) => i.name).join(", ")}</p>
          <p className="mt-0.5 text-[14px] font-bold">{rupees(o.total)} <span className="text-[12px] font-normal text-[#8b8ba3]">· {o.itemCount} item{o.itemCount === 1 ? "" : "s"}</span></p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#a7a9b6]" />
      </div>
      <MiniTrack status={o.status} />
    </Link>
  );
}
