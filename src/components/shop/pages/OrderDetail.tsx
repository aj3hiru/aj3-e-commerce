import Link from "next/link";
import { Check, CircleX, ClipboardCheck, Headphones, House, ImageIcon, MapPin, PackageCheck, Truck } from "lucide-react";
import { Page, PriceRow, Section, StatusPill, btnOutline, btnPrimary, rupees } from "@/components/shop/ui/Meesho";
import { ORDER_STEPS, STEP_LABEL, fmtDate } from "@/components/shop/pages/Orders";
import { cn } from "@/lib/utils";

const STEP_ICON = [ClipboardCheck, PackageCheck, Truck, House];
const STEP_TEXT: Record<string, string> = {
  Pending: "We've received your order.",
  "In Progress": "Your order is being packed.",
  "Out for Delivery": "Your order is on the way.",
  Delivered: "Your order has been delivered.",
};

export interface OrderDetail {
  number: string; createdAt: string; status: string; placed: boolean; storeName: string; helpPhone: string | null;
  items: { id: number; name: string; qty: number; price: number; slug: string | null; image: string | null }[];
  discount: number; gst: number; total: number; paymentName: string; paymentStatus: string;
  customerName: string; customerPhone: string | null; address: string;
}

/** One order: success banner (just placed), tracking timeline, items, prices, address, help. */
export function OrderDetailView({ o }: { o: OrderDetail }) {
  const at = ORDER_STEPS.indexOf(o.status);
  const canceled = o.status === "Canceled";
  const itemsTotal = o.items.reduce((n, i) => n + i.price * i.qty, 0);
  return (
      <Page title="Order Details" back="/shop/order">
        {o.placed && (
          <section className="mb-2 flex flex-col items-center bg-white px-4 py-7 text-center">
            <span className="grid h-16 w-16 animate-[pop_.5s_cubic-bezier(.34,1.56,.64,1)] place-items-center rounded-full bg-[#038d63] text-white shadow-[0_8px_20px_rgba(3,141,99,.35)]">
              <Check className="h-9 w-9" strokeWidth={3} />
            </span>
            <p className="mt-4 text-[18px] font-semibold">Order placed successfully!</p>
            <p className="mt-1 text-[13px] text-[#8b8ba3]">Thank you for shopping with {o.storeName}.</p>
            <style>{"@keyframes pop{0%{transform:scale(.3);opacity:0}100%{transform:scale(1);opacity:1}}"}</style>
          </section>
        )}

        <Section>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">Order #{o.number}</p>
              <p className="text-[12px] text-[#8b8ba3]">Placed on {fmtDate(o.createdAt, true)}</p>
            </div>
            <StatusPill status={o.status} />
          </div>
        </Section>

        <Section title="Order Status">
          {canceled ? (
            <div className="flex items-center gap-3 rounded-[6px] bg-[#fdecee] px-3.5 py-3 text-[#d0263a]">
              <CircleX className="h-6 w-6 shrink-0" /><div><p className="text-[14px] font-semibold">Order cancelled</p><p className="text-[12.5px] opacity-90">This order was cancelled. Any payment made will be refunded.</p></div>
            </div>
          ) : (
            <ol>
              {ORDER_STEPS.map((s, i) => {
                const Icon = STEP_ICON[i], done = i < at, now = i === at;
                return (
                  <li key={s} className="relative flex gap-3.5 pb-5 last:pb-0">
                    {i < ORDER_STEPS.length - 1 && <span className={cn("absolute left-[15px] top-8 h-[calc(100%-28px)] w-[2px]", i < at ? "bg-[#038d63]" : "bg-[#e3e3ec]")} aria-hidden />}
                    <span className={cn("relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full",
                      done ? "bg-[#038d63] text-white" : now ? "bg-[#038d63] text-white ring-4 ring-[#038d63]/20" : "bg-[#f0f0f5] text-[#a7a9b6]")}>
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" strokeWidth={2} />}
                    </span>
                    <div className="pt-1">
                      <p className={cn("text-[14px]", i <= at ? "font-semibold text-[#353543]" : "text-[#8b8ba3]")}>{STEP_LABEL[s]}</p>
                      {now && <p className="text-[12.5px] text-[#616173]">{STEP_TEXT[s]}</p>}
                      {i === 0 && <p className="text-[12px] text-[#8b8ba3]">{fmtDate(o.createdAt, true)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        <Section title={`Items (${o.items.reduce((n, i) => n + i.qty, 0)})`}>
          <ul className="divide-y divide-[#eaeaf2]">
            {o.items.map((it) => {
              const body = (
                <>
                  <span className="h-16 w-14 shrink-0 overflow-hidden rounded-[6px] border border-[#eaeaf2] bg-white">
                    {it.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/${it.image}`} alt="" className="h-full w-full object-contain" />
                      : <span className="grid h-full w-full place-items-center bg-[#f5f5f8] text-[#c9c9d6]"><ImageIcon className="h-5 w-5" /></span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[14px] leading-5">{it.name}</span>
                    <span className="text-[12px] text-[#8b8ba3]">Qty {it.qty} × {rupees(it.price)}</span>
                  </span>
                  <span className="text-[14px] font-semibold">{rupees(it.price * it.qty)}</span>
                </>
              );
              return <li key={it.id}>{it.slug ? <Link href={`/shop/product?slug=${encodeURIComponent(it.slug)}`} className="flex items-center gap-3 py-3">{body}</Link> : <div className="flex items-center gap-3 py-3">{body}</div>}</li>;
            })}
          </ul>
        </Section>

        <Section title="Price Details">
          <PriceRow label="Items total" value={rupees(itemsTotal)} />
          {o.discount > 0 && <PriceRow label="Coupon discount" value={`- ${rupees(o.discount)}`} tone="green" />}
          {o.gst > 0 && <PriceRow label="GST" value={`+ ${rupees(o.gst)}`} />}
          <div className="my-1.5 border-t border-dashed border-[#dcdce6]" />
          <PriceRow label="Order Total" value={rupees(o.total)} bold />
          <div className="mt-3 flex items-center justify-between rounded-[6px] bg-[#f5f5f8] px-3 py-2.5 text-[13.5px]">
            <span className="text-[#616173]">Paid by <b className="font-semibold text-[#353543]">{o.paymentName}</b></span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", o.paymentStatus === "Paid" ? "bg-[#e7f8ee] text-[#038d63]" : "bg-[#fff4e0] text-[#c77700]")}>{o.paymentStatus}</span>
          </div>
        </Section>

        <Section title={<span className="flex items-center gap-2"><MapPin className="h-[18px] w-[18px] text-[var(--hp-accent)]" />Delivery Address</span>}>
          <p className="text-[14px] font-semibold">{o.customerName}{o.customerPhone && <span className="font-normal text-[#616173]"> · {o.customerPhone}</span>}</p>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-5 text-[#616173]">{o.address || "—"}</p>
        </Section>

        <div className="grid grid-cols-2 gap-2 bg-white px-4 py-4">
          <Link href="/shop/order" className={btnOutline}>All Orders</Link>
          {o.helpPhone
            ? <a href={`tel:${o.helpPhone.replace(/\s/g, "")}`} className={btnPrimary}><Headphones className="h-[18px] w-[18px]" />Need Help?</a>
            : <Link href="/shop" className={btnPrimary}>Shop More</Link>}
        </div>
      </Page>
  );
}
