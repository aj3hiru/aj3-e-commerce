"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAPTOP_RATIO, LaptopFrame, PhoneFrame } from "@/components/admin/PhoneFrame";
import { PREVIEW_MSG, type StorePreviewState } from "./types";

type Device = "mobile" | "desktop";
const DESKTOP_W = 1100; // wide enough for the store's desktop layout (≥ 901 px), small enough to stay readable

/**
 * Live store preview for Business Settings: the real header, menus, sidebar
 * and footer inside the phone / laptop, redrawn on every edit (nothing needs
 * saving first). Sticky and sized to the window.
 */
export function StorePreview({ state, device: suggested }: { state: Omit<StorePreviewState, "loggedIn">; device?: Device }) {
  const [device, setDevice] = useState<Device>(suggested ?? "mobile");
  const [loggedIn, setLoggedIn] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 640 });

  // Follow the section: Header Menu is a desktop thing, the sidebar a phone thing.
  useEffect(() => { if (suggested) setDevice(suggested); }, [suggested]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const post = useCallback(() => {
    const w = frame.current?.contentWindow;
    if (w) w.postMessage({ type: PREVIEW_MSG, state: { ...state, loggedIn, drawer: device === "mobile" && state.drawer } }, window.location.origin);
  }, [state, loggedIn, device]);

  useEffect(() => { const t = setTimeout(post, 120); return () => clearTimeout(t); }, [post]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === `${PREVIEW_MSG}:ready`) post(); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [post]);

  const iframe = <iframe ref={frame} src="/admin/settings-preview" title="Store preview" onLoad={post} className="absolute inset-0 h-full w-full border-0 bg-white" />;
  const pad = 20;
  const scale = Math.max(0.15, Math.min(1, (size.w - pad) / (DESKTOP_W * LAPTOP_RATIO.w), (size.h - pad) / (DESKTOP_W * LAPTOP_RATIO.pageH * LAPTOP_RATIO.h)));
  const phoneW = 375;

  return (
    <section className="flex h-[640px] flex-col overflow-hidden rounded-2xl bg-white font-storefront shadow-sm ring-1 ring-[#eaeaf2] xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0f0f5] px-4 py-3">
        <p className="text-[15px] font-semibold text-[#353543]">Live preview</p>
        <div className="flex items-center gap-2">
          <Toggle value={loggedIn ? "in" : "out"} onChange={(v) => setLoggedIn(v === "in")} options={[["out", "Guest"], ["in", "Logged in"]]} />
          <div className="inline-flex rounded-[6px] bg-[#f3f3f7] p-1">
            {([["mobile", Smartphone, "Mobile"], ["desktop", Monitor, "Desktop"]] as const).map(([d, Icon, label]) => (
              <button key={d} type="button" onClick={() => setDevice(d)} aria-label={`${label} view`} aria-pressed={device === d}
                className={cn("flex h-8 items-center gap-1.5 rounded-[4px] px-2.5 text-[13px] font-semibold transition", device === d ? "bg-white text-[#9f2089] shadow-sm" : "text-[#616173]")}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div ref={box} className="relative flex min-h-0 flex-1 items-center justify-center bg-[linear-gradient(180deg,#f7f7fa,#ececf2)] p-2.5">
        {device === "mobile"
          ? <PhoneFrame width={phoneW} fill className="max-h-full">{iframe}</PhoneFrame>
          : <LaptopFrame width={DESKTOP_W} scale={scale}>{iframe}</LaptopFrame>}
      </div>
    </section>
  );
}

function Toggle({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-[6px] bg-[#f3f3f7] p-1">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
          className={cn("h-8 rounded-[4px] px-2.5 text-[13px] font-semibold transition", value === v ? "bg-white text-[#9f2089] shadow-sm" : "text-[#616173]")}>{label}</button>
      ))}
    </div>
  );
}
