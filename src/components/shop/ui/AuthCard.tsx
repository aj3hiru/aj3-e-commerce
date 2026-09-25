import { ShoppingBag } from "lucide-react";

/** Meesho-style login / sign-up card: a soft gradient header over a white form. */
export function AuthCard({ heading, sub, children }: { heading: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="-mx-8 -mt-6 -mb-6 bg-[#f5f5f8] font-storefront text-[#353543] shop:mx-0 shop:mt-0 shop:mb-0 shop:rounded-xl shop:py-8">
      <div className="mx-auto max-w-[440px] overflow-hidden bg-white shop:rounded-xl shop:shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <div className="relative flex items-center gap-4 overflow-hidden px-5 py-7"
          style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--hp-accent) 13%, white), #e7eeff)" }}>
          <span aria-hidden className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/40" />
          <span aria-hidden className="absolute -bottom-12 right-16 h-24 w-24 rounded-full bg-white/30" />
          <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white shadow-sm"><ShoppingBag className="h-7 w-7 text-[var(--hp-accent)]" strokeWidth={1.8} /></span>
          <div className="relative min-w-0">
            <p className="text-[19px] font-bold leading-6">{heading}</p>
            <p className="mt-0.5 text-[13px] leading-[18px] text-[#616173]">{sub}</p>
          </div>
        </div>
        <div className="px-5 pb-7 pt-6">{children}</div>
      </div>
    </div>
  );
}
