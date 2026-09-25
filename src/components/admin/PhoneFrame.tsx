"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Device mockups for every admin preview, cut from the store's reference
 * images (public/device/*.webp — the screen is transparent, the preview
 * shows through it):
 *   phone.webp   514 × 1004, screen at (27, 24) 460 × 951, punch-hole camera
 *   laptop.webp 1488 × 960,  screen at (113, 31) 1264 × 825, camera notch
 */
const PHONE = { w: 514, h: 1004, x: 27, y: 24, sw: 460, sh: 951 };
const LAPTOP = { w: 1488, h: 960, x: 113, y: 31, sw: 1264, sh: 825 };

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useClock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?[ap]m$/i, ""));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Status bar as in the reference: time on the left; Wi-Fi, Do-not-disturb and a battery pill on the right. */
function StatusBar({ k, tone, overlay }: { k: number; tone: string; overlay?: boolean }) {
  const clock = useClock();
  const fs = 16 * k;
  return (
    <div className={cn("z-20 flex shrink-0 items-center justify-between font-semibold", overlay ? "absolute inset-x-0 top-0" : "relative")}
      style={{ height: 46 * k, padding: `0 ${26 * k}px 0 ${24 * k}px`, fontSize: fs, color: tone, fontFamily: "Roboto, Inter, system-ui, sans-serif" }}>
      <span suppressHydrationWarning className="tabular-nums">{clock}</span>
      <span className="flex items-center" style={{ gap: 5 * k }}>
        <svg width={17 * k} height={13 * k} viewBox="0 0 17 13" fill="currentColor" aria-hidden><path d="M8.5 2.3c2.5 0 4.8.9 6.6 2.5L16.5 3.3A11.7 11.7 0 0 0 8.5.2 11.7 11.7 0 0 0 .5 3.3l1.4 1.5A9.7 9.7 0 0 1 8.5 2.3Zm0 3.8c1.5 0 2.9.5 4 1.4l1.4-1.5A8 8 0 0 0 8.5 4a8 8 0 0 0-5.4 2l1.4 1.5c1.1-.9 2.5-1.4 4-1.4Zm0 3.8c-.6 0-1.1.2-1.5.6l1.5 1.6 1.5-1.6c-.4-.4-.9-.6-1.5-.6Z" /></svg>
        <svg width={14 * k} height={14 * k} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="7" cy="7" r="5.6" /><path d="M3.2 10.8 10.8 3.2" /></svg>
        <span className="flex items-center justify-center rounded-full font-bold leading-none" style={{ height: 14 * k, minWidth: 25 * k, padding: `0 ${4 * k}px`, fontSize: 10 * k, background: tone === "#fff" ? "rgba(255,255,255,0.85)" : "#6b6b72", color: tone === "#fff" ? "#222" : "#fff" }}>82</span>
      </span>
    </div>
  );
}

/** Scales a fixed-size device down to fit its container's height (`fill`). */
function useFit(fill: boolean | undefined, naturalH: number) {
  const box = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(1);
  useIsoLayoutEffect(() => {
    if (!fill || !box.current) return;
    const el = box.current;
    const measure = () => setS(Math.min(1, Math.max(0.3, el.clientHeight / naturalH)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill, naturalH]);
  return { box, s };
}

/**
 * Phone. `width` is the screen width in CSS pixels (the page inside is laid
 * out at that width); the height follows the phone's shape. `fill` shrinks
 * the whole phone to fit the container's height. The status bar sits above
 * the content unless `overlay` (lock screens, full-bleed art).
 */
export function PhoneFrame({ width = 300, fill, className, screenClassName, status = "dark", overlay, children }: {
  width?: number; height?: number; fill?: boolean; className?: string; screenClassName?: string;
  status?: "dark" | "light"; overlay?: boolean; children: React.ReactNode;
}) {
  const k = width / PHONE.sw;
  const W = PHONE.w * k, H = PHONE.h * k;
  const { box, s } = useFit(fill, H);
  return (
    <div ref={box} className={cn("relative shrink-0", className)} style={{ width: W * s, height: fill ? "100%" : H }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: s < 1 ? `scale(${s})` : undefined }}>
        <div className={cn("absolute flex flex-col overflow-hidden bg-white", screenClassName)}
          style={{ left: PHONE.x * k, top: PHONE.y * k, width: PHONE.sw * k, height: PHONE.sh * k, borderRadius: 9 * k }}>
          <StatusBar k={k} tone={status === "light" ? "#fff" : "#1b1b1f"} overlay={overlay} />
          <div className="relative min-h-0 flex-1">{children}</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/device/phone.webp" alt="" draggable={false} className="pointer-events-none absolute inset-0 z-30 h-full w-full select-none" />
      </div>
    </div>
  );
}

/**
 * Laptop. The page inside is laid out `width` CSS px wide (e.g. 1280) with
 * the screen's own height, then shrunk by `scale`. `fluid` instead fills the
 * container's width and lays its content out at the screen's actual size
 * (small previews such as a menu bar).
 */
export function LaptopFrame({ width = 1280, scale = 1, fluid, className, children }: {
  width?: number; height?: number; scale?: number; fluid?: boolean; className?: string; children: React.ReactNode;
}) {
  const pageH = Math.round((width * LAPTOP.sh) / LAPTOP.sw);
  const k = (width * scale) / LAPTOP.sw;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className={cn("relative shrink-0", className)}
      style={fluid ? { width: "100%", aspectRatio: `${LAPTOP.w} / ${LAPTOP.h}` } : { width: LAPTOP.w * k, height: LAPTOP.h * k }}>
      <div className="absolute overflow-hidden bg-white"
        style={{ left: pct(LAPTOP.x, LAPTOP.w), top: pct(LAPTOP.y, LAPTOP.h), width: pct(LAPTOP.sw, LAPTOP.w), height: pct(LAPTOP.sh, LAPTOP.h), borderRadius: "0.5% / 0.8%" }}>
        {fluid ? children : (
          <div style={{ width, height: pageH, transform: `scale(${scale})`, transformOrigin: "0 0" }} className="relative">{children}</div>
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/device/laptop.webp" alt="" draggable={false} className="pointer-events-none absolute inset-0 z-30 h-full w-full select-none" />
    </div>
  );
}

/** Laptop outer size ÷ page size, for callers fitting a laptop into a box. */
export const LAPTOP_RATIO = { w: LAPTOP.w / LAPTOP.sw, h: LAPTOP.h / LAPTOP.sh, pageH: LAPTOP.sh / LAPTOP.sw };
