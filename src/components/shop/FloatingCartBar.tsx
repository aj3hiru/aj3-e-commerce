"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, ShoppingCart } from "lucide-react";
import { useCart } from "@/hooks/useCart";

const HIDE_ON = ["/cart", "/checkout", "/order", "/login", "/register", "/account"];

/**
 * Floating "View Cart" bar: slides up with a bounce the moment the cart has
 * something in it, pulses when the quantity changes, ripples on tap. Sits
 * above the bottom tab bar / sticky Buy Now bar via --fcb-offset.
 */
export function FloatingCartBar() {
  const { count, total, bump, ui } = useCart();
  const pathname = usePathname();
  const bar = useRef<HTMLAnchorElement>(null);
  const [mounted, setMounted] = useState(false);
  const firstBump = useRef(bump);
  useEffect(() => { const t = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(t); }, []);

  useEffect(() => {
    const el = bar.current;
    if (!el || bump === firstBump.current) return;
    el.animate([{ scale: 1 }, { scale: 1.05 }, { scale: 1 }], { duration: 450, easing: "ease-out" });
  }, [bump]);

  if (!ui.floatingBar || HIDE_ON.some((p) => pathname?.startsWith(p))) return null;
  const show = mounted && count > 0;
  function ripple(e: React.MouseEvent<HTMLAnchorElement>) {
    const el = bar.current;
    if (!el) return;
    const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 1.6;
    const s = document.createElement("span");
    Object.assign(s.style, { position: "absolute", borderRadius: "50%", background: "rgba(255,255,255,.5)", pointerEvents: "none",
      width: `${size}px`, height: `${size}px`, left: `${e.clientX - r.left - size / 2}px`, top: `${e.clientY - r.top - size / 2}px` });
    el.appendChild(s);
    s.animate([{ transform: "scale(0)", opacity: 1 }, { transform: "scale(1)", opacity: 0 }], { duration: 550, easing: "ease-out" }).onfinish = () => s.remove();
  }

  return (
    <>
    {/* Room at the page bottom so the bar never covers the end of the footer. */}
    {show && <div aria-hidden className="h-[76px] shrink-0" />}
    <div className="pointer-events-none fixed inset-x-0 z-[950] flex justify-center px-3 transition-[bottom] duration-300" style={{ bottom: "calc(var(--fcb-offset, 0px) + 12px)" }}>
      <Link ref={bar} href="/cart" onClick={ripple} aria-live="polite" aria-hidden={!show} tabIndex={show ? 0 : -1}
        className="relative flex h-[56px] w-full max-w-[560px] items-center gap-3 overflow-hidden rounded-[8px] pl-3 pr-2 text-white no-underline"
        style={{
          background: ui.barColor,
          boxShadow: `0 8px 22px color-mix(in srgb, ${ui.barColor} 35%, transparent), 0 2px 6px rgba(0,0,0,.1)`,
          transform: show ? "translateY(0)" : "translateY(120px)", opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none",
          transition: "transform .4s cubic-bezier(.34,1.56,.64,1), opacity .25s ease",
        }}>
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20">
          <ShoppingCart className="h-[19px] w-[19px]" strokeWidth={2} />
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-white px-1 text-[11px] font-bold tabular-nums" style={{ color: ui.barColor }}>{count}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[12px] opacity-90">{count} item{count === 1 ? "" : "s"} added</span>
          <span className="text-[17px] font-bold tracking-tight">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        </span>
        {/* White button with accent text — the inverse of Meesho's Buy Now */}
        <span className="flex h-10 shrink-0 items-center gap-1 rounded-[4px] bg-white px-3.5 text-[15px] font-semibold" style={{ color: ui.barColor }}>
          {ui.barLabel}<ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
        </span>
      </Link>
    </div>
    </>
  );
}
