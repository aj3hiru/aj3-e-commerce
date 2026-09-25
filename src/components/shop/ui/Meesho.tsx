import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Meesho-style building blocks shared by the storefront's inner pages (cart,
 * checkout, orders, account, login, wishlist…): a white title bar, white
 * sections on a light grey page, 4px accent buttons and inputs. Colours come
 * from --hp-accent (set by ShopLayout from the Customizer).
 */

export const btnPrimary = "inline-flex h-11 items-center justify-center gap-2 rounded-[4px] bg-[var(--hp-accent)] px-5 text-[15px] font-medium text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";
export const btnOutline = "inline-flex h-11 items-center justify-center gap-2 rounded-[4px] border border-[var(--hp-accent)] bg-white px-5 text-[15px] font-medium text-[var(--hp-accent)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";
export const inputCls = "w-full rounded-[4px] border border-[#cfcedc] bg-white px-3 text-[15px] text-[#353543] outline-none transition placeholder:text-[#a7a9b6] focus:border-[var(--hp-accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--hp-accent)_15%,transparent)] disabled:bg-[#f5f5f8] disabled:text-[#8b8ba3]";
export const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Full-bleed grey page with a white title bar (and optional steps), content capped at phone-ish width. */
export function Page({ title, back, steps, children, wide }: {
  title: string; back?: string; steps?: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="-mx-8 -mt-6 -mb-6 min-h-[70vh] bg-[#f5f5f8] pb-6 font-storefront text-[#353543] shop:mx-0 shop:mt-0 shop:mb-0 shop:rounded-xl">
      <div className={cn("mx-auto", wide ? "max-w-[1100px]" : "max-w-[760px]")}>
        <div className="flex h-14 items-center gap-2 border-b border-[#eaeaf2] bg-white px-2 shop:rounded-t-xl">
          {back ? (
            <Link href={back} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full text-[#353543] hover:bg-[#f5f5f8]"><ArrowLeft className="h-[22px] w-[22px]" strokeWidth={2} /></Link>
          ) : <span className="w-2" />}
          <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold uppercase tracking-[0.3px]">{title}</h1>
        </div>
        {steps}
        <div className="pt-2">{children}</div>
      </div>
    </div>
  );
}

/** A white block; stack them with the page's grey showing between (Meesho's 8px bands). */
export function Section({ title, right, children, className, id }: {
  title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; id?: string;
}) {
  return (
    <section id={id} className={cn("mb-2 bg-white px-4 py-4", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-[16px] font-semibold leading-6">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const STEPS = ["Cart", "Address", "Payment", "Summary"];

/** Meesho's checkout progress: numbered circles joined by a line, done steps ticked. */
export function Steps({ active }: { active: number }) {
  return (
    <div className="flex items-start border-b border-[#eaeaf2] bg-white px-3 pb-3 pt-3.5">
      {STEPS.map((s, i) => (
        <div key={s} className="relative flex flex-1 flex-col items-center">
          {i > 0 && <span className={cn("absolute right-1/2 top-[9px] h-[2px] w-full", i <= active ? "bg-[var(--hp-accent)]" : "bg-[#dcdce6]")} aria-hidden />}
          <span className={cn("relative z-[1] grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold",
            i < active ? "bg-[var(--hp-accent)] text-white" : i === active ? "border-2 border-[var(--hp-accent)] bg-white text-[var(--hp-accent)]" : "border-2 border-[#dcdce6] bg-white text-[#a7a9b6]")}>
            {i < active ? <Check className="h-3 w-3" strokeWidth={3.5} /> : i + 1}
          </span>
          <span className={cn("mt-1 text-[12px]", i <= active ? "font-medium text-[#353543]" : "text-[#8b8ba3]")}>{s}</span>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-[#616173]">{label}{hint && <span className="font-normal text-[#a7a9b6]">{hint}</span>}</span>
      {children}
    </label>
  );
}

export function Notice({ tone = "info", children }: { tone?: "success" | "error" | "info"; children: React.ReactNode }) {
  const t = { success: ["bg-[#e7f8ee] text-[#038d63]", CircleCheck], error: ["bg-[#fdecee] text-[#d0263a]", CircleAlert], info: ["bg-[#eef3ff] text-[#3f64e5]", Info] }[tone] as [string, typeof Info];
  const Icon = t[1];
  return <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-[6px] px-3 py-2.5 text-[13.5px] font-medium", t[0])}><Icon className="mt-px h-[18px] w-[18px] shrink-0" />{children}</div>;
}

export function Empty({ icon: Icon, title, text, action }: { icon: typeof Info; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center bg-white px-6 py-14 text-center">
      <span className="grid h-24 w-24 place-items-center rounded-full bg-[color-mix(in_srgb,var(--hp-accent)_9%,white)]"><Icon className="h-11 w-11 text-[var(--hp-accent)]" strokeWidth={1.5} /></span>
      <p className="mt-5 text-[18px] font-semibold">{title}</p>
      {text && <p className="mt-1.5 max-w-[300px] text-[14px] leading-5 text-[#8b8ba3]">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Label / value rows of a price breakdown. */
export function PriceRow({ label, value, tone, bold }: { label: React.ReactNode; value: string; tone?: "green"; bold?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-1.5", bold ? "text-[16px] font-semibold text-[#353543]" : "text-[14px] text-[#616173]")}>
      <span>{label}</span><span className={cn(tone === "green" && "text-[#038d63]")}>{value}</span>
    </div>
  );
}

const STATUS: Record<string, string> = {
  Pending: "bg-[#fff4e0] text-[#c77700]", "In Progress": "bg-[#eef3ff] text-[#3f64e5]", "Out for Delivery": "bg-[#f3e8ff] text-[#7c3aed]",
  Delivered: "bg-[#e7f8ee] text-[#038d63]", Canceled: "bg-[#fdecee] text-[#d0263a]",
};
export function StatusPill({ status }: { status: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold", STATUS[status] ?? "bg-[#f0f0f5] text-[#616173]")}>{status}</span>;
}

/** Bottom bar that stays on screen (total + main action), with room kept below the page. */
export function StickyBottom({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="h-[72px]" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-[900] border-t border-[#eaeaf2] bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-[760px] items-center gap-3 px-4 py-3">{children}</div>
      </div>
    </>
  );
}
