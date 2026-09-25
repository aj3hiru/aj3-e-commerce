"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Device mockups for every admin preview: a modern Android phone (thin black
 * bezel, metal edge, punch-hole camera, live status bar, side buttons) and a
 * laptop (black lid with a camera notch, silver base).
 */

const EDGE = 3;   // metal rim
const BEZEL = 9;  // black glass border
const STATUS = 30;

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

function StatusIcons({ tone }: { tone: string }) {
  return (
    <span className="flex items-center gap-[5px]" style={{ color: tone }}>
      {/* Wi-Fi */}
      <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" aria-hidden><path d="M7.5 2.2c2.2 0 4.2.8 5.8 2.2l1.2-1.3A10.3 10.3 0 0 0 7.5.4 10.3 10.3 0 0 0 .5 3.1l1.2 1.3a8.5 8.5 0 0 1 5.8-2.2Zm0 3.3c1.3 0 2.5.5 3.5 1.3l1.2-1.3A7 7 0 0 0 7.5 3.7a7 7 0 0 0-4.7 1.8L4 6.8c1-.8 2.2-1.3 3.5-1.3Zm0 3.3c-.5 0-1 .2-1.3.5l1.3 1.4 1.3-1.4c-.3-.3-.8-.5-1.3-.5Z" /></svg>
      {/* Signal */}
      <svg width="14" height="11" viewBox="0 0 14 11" fill="currentColor" aria-hidden><rect x="0" y="7.5" width="2.4" height="3.5" rx=".6" /><rect x="3.8" y="5" width="2.4" height="6" rx=".6" /><rect x="7.6" y="2.5" width="2.4" height="8.5" rx=".6" /><rect x="11.4" y="0" width="2.4" height="11" rx=".6" /></svg>
      {/* Battery */}
      <span className="flex h-[13px] min-w-[24px] items-center justify-center rounded-[4px] px-[3px] text-[9px] font-bold leading-none" style={{ background: tone, color: tone === "#fff" ? "#111" : "#fff" }}>82</span>
    </span>
  );
}

/**
 * `width`/`height` are the screen size in CSS pixels; the phone adds its rim
 * and bezel around them. `fill` lets the phone shrink to its container's
 * height. The status bar takes the top of the screen unless `overlay`, which
 * floats it over the content (lock screens, full-bleed art).
 */
export function PhoneFrame({ width = 300, height = 600, fill, className, screenClassName, status = "dark", overlay, children }: {
  width?: number; height?: number; fill?: boolean; className?: string; screenClassName?: string;
  status?: "dark" | "light"; overlay?: boolean; children: React.ReactNode;
}) {
  const clock = useClock();
  const pad = EDGE + BEZEL;
  const tone = status === "light" ? "#fff" : "#1b1b1f";
  const bar = (
    <div className={cn("relative z-20 flex shrink-0 items-center justify-between px-5 text-[13px] font-semibold", overlay && "absolute inset-x-0 top-0")} style={{ height: STATUS, color: tone }}>
      <span suppressHydrationWarning className="tabular-nums">{clock}</span>
      <span className="absolute left-1/2 top-[8px] h-[13px] w-[13px] -translate-x-1/2 rounded-full bg-[#0b0b0d] shadow-[inset_0_0_0_2px_#1d1d22,0_0_0_1px_rgba(255,255,255,0.06)]">
        <span className="absolute left-[4px] top-[3px] h-[3px] w-[3px] rounded-full bg-[#2a3350]" />
      </span>
      <StatusIcons tone={tone} />
    </div>
  );
  return (
    <div className={cn("relative shrink-0", className)}
      style={fill ? { width: width + pad * 2, height: "100%", maxHeight: height + pad * 2 } : { width: width + pad * 2, height: height + pad * 2 }}>
      {/* Side buttons */}
      <span className="absolute right-[-3px] top-[18%] h-[62px] w-[3px] rounded-r-[2px] bg-[linear-gradient(90deg,#3a3a3f,#8a8a90)]" />
      <span className="absolute right-[-3px] top-[33%] h-[40px] w-[3px] rounded-r-[2px] bg-[linear-gradient(90deg,#3a3a3f,#8a8a90)]" />
      {/* Metal rim → black bezel → screen */}
      <div className="h-full w-full rounded-[46px] bg-[linear-gradient(145deg,#7c7c82_0%,#3b3b40_35%,#5e5e64_65%,#2e2e33_100%)] shadow-[0_24px_50px_-12px_rgba(20,20,35,0.35),0_8px_18px_-8px_rgba(20,20,35,0.25)]" style={{ padding: EDGE }}>
        <div className="h-full w-full rounded-[43px] bg-[#0a0a0c]" style={{ padding: BEZEL }}>
          <div className={cn("relative flex h-full w-full flex-col overflow-hidden rounded-[34px] bg-white", screenClassName)}>
            {bar}
            <div className="relative min-h-0 flex-1">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Laptop mockup. `scale` shrinks a full-size page (`width` × `height` CSS px,
 * e.g. 1280 × 800) to fit; the lid and base are drawn around the scaled
 * screen. `fluid` instead fills the container's width and lets the screen
 * grow with its content (small previews such as a menu bar).
 */
export function LaptopFrame({ width = 1280, height = 800, scale = 1, fluid, className, children }: {
  width?: number; height?: number; scale?: number; fluid?: boolean; className?: string; children: React.ReactNode;
}) {
  const w = width * scale;
  const bezel = fluid ? 12 : Math.max(8, Math.round(14 * Math.min(1, scale * 1.6)));
  const lidW = w + bezel * 2;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: fluid ? "100%" : lidW * 1.12 }}>
      {/* Lid */}
      <div className="relative mx-auto rounded-t-[18px] rounded-b-[6px] bg-[#0b0b0d] shadow-[inset_0_0_0_1.5px_#34343a]" style={{ width: fluid ? "89.3%" : lidW, padding: `${bezel + 4}px ${bezel}px ${bezel + 2}px` }}>
        {/* Camera notch */}
        <span className="absolute left-1/2 top-0 z-20 flex h-[15px] w-[92px] -translate-x-1/2 items-center justify-center rounded-b-[9px] bg-[#0b0b0d]">
          <span className="h-[5px] w-[5px] rounded-full bg-[#1f2533] shadow-[0_0_0_1px_#2c2c33]" />
        </span>
        <div className="relative overflow-hidden rounded-[3px] bg-white" style={fluid ? undefined : { width: w, height: height * scale }}>
          {fluid ? children : (
            <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0" }} className="relative">{children}</div>
          )}
        </div>
      </div>
      {/* Base */}
      <div className="relative mx-auto h-[14px] rounded-b-[14px] rounded-t-[3px] bg-[linear-gradient(180deg,#e9eaec_0%,#c9cacd_45%,#9d9ea2_100%)] shadow-[0_14px_24px_-10px_rgba(20,20,35,0.35)]" style={{ width: "100%" }}>
        <span className="absolute left-1/2 top-0 h-[5px] w-[16%] -translate-x-1/2 rounded-b-[6px] bg-[linear-gradient(180deg,#a9aaae,#cfd0d3)]" />
      </div>
    </div>
  );
}
