"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Gift, X } from "lucide-react";
import type { PromoBar as PromoConfig } from "@/types/home";

/**
 * The strip above the header (Meesho's "Extra 35% off on First Order ·
 * Download Now · ✕"): image, title, description, action button and close.
 * Closing hides it for the configured hours; changing the offer shows it again.
 */
export function PromoBar({ promo }: { promo: PromoConfig }) {
  const pathname = usePathname();
  const key = `promo_closed:${hash(`${promo.title}|${promo.subtitle}|${promo.buttonUrl}`)}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // The customizer's preview always shows the bar, even if it was closed before.
    if (new URLSearchParams(window.location.search).get("hc") === "draft") { setVisible(true); return; }
    let closedAt = 0;
    try { closedAt = Number(localStorage.getItem(key) ?? 0); } catch { /* storage blocked */ }
    const hidden = closedAt > 0 && (promo.dismissHours === 0 ? sessionStorage.getItem(key) === "1" : Date.now() - closedAt < promo.dismissHours * 3_600_000);
    setVisible(!hidden);
  }, [key, promo.dismissHours]);

  if (!promo.enabled || !promo.title || (promo.showOn === "home" && pathname !== "/shop") || !visible) return null;

  function close() {
    try { localStorage.setItem(key, String(Date.now())); sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
    setVisible(false);
  }

  const img = promo.image ? (/^https:/.test(promo.image) ? promo.image : `/${promo.image}`) : "";
  return (
    <div role="region" aria-label="Offer" data-hc="promo" style={{ background: promo.bgColor }}>
      <div className="mx-auto flex min-h-[62px] max-w-[1360px] items-center gap-2.5 py-2 pl-3 pr-1.5 shop:px-8">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" className="h-10 w-10 shrink-0 object-contain" />
          : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/70" style={{ color: promo.buttonColor }}><Gift className="h-5 w-5" /></span>}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="line-clamp-2 text-[13px] font-medium text-[#353543]">{promo.title}</p>
          {promo.subtitle && <p className="mt-1 truncate text-[12px] text-[#353543]/80">{promo.subtitle}</p>}
        </div>
        {promo.buttonLabel && promo.buttonUrl && (
          <Link href={promo.buttonUrl} className="flex h-[30px] shrink-0 items-center whitespace-nowrap rounded-[4px] px-3 text-[13px] font-semibold text-white"
            style={{ background: promo.buttonColor }}>
            {promo.buttonLabel}
          </Link>
        )}
        <button type="button" onClick={close} aria-label="Close offer" className="grid h-8 w-8 shrink-0 place-items-center text-[#666]"><X className="h-[18px] w-[18px]" strokeWidth={2.2} /></button>
      </div>
    </div>
  );
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
