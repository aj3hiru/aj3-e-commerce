"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Clock3 } from "lucide-react";
import type { CampaignBannerData } from "@/types/campaign-home";

/**
 * One campaign banner, in one of five templates. Sizes follow the banner's
 * own width (container units), so it looks the same in the admin preview
 * phone as on the real homepage.
 */
export function CampaignBanner({ c, inert }: { c: CampaignBannerData; inert?: boolean }) {
  const h = c.home;
  const title = h.title || c.name;
  const sub = h.subtitle || `${c.offer} ${c.appliesTo}`;
  const left = useCountdown(c.endsAt);
  const Tag = inert ? "div" : "a";
  const linkProps = inert ? {} : { href: c.href };
  const col = h.color;
  const cq = { containerType: "inline-size" as const };

  const Timer = ({ dark }: { dark?: boolean }) => left ? (
    <span className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 font-semibold tabular-nums" style={{ fontSize: "clamp(10px,2.6cqw,13px)", background: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.9)", color: dark ? "#fff" : "#353543" }}>
      <Clock3 style={{ width: "1.1em", height: "1.1em" }} />Ends in {left}
    </span>
  ) : null;

  if (h.template === "minimal") {
    return (
      <div style={cq}>
        <Tag {...linkProps} className="flex items-center gap-3 rounded-[8px] border border-[#eaeaf2] bg-white px-3 py-2.5" style={{ borderLeft: `4px solid ${col}` }}>
          <span className="shrink-0 rounded-[6px] px-2 py-1 font-extrabold text-white" style={{ background: col, fontSize: "clamp(11px,3cqw,15px)" }}>{c.offer}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-[#353543]" style={{ fontSize: "clamp(13px,3.4cqw,17px)" }}>{title}</span>
            {left && <span className="block text-[#8b8ba3]" style={{ fontSize: "clamp(10px,2.6cqw,12px)" }}>Ends in {left}</span>}
          </span>
          <ArrowRight className="h-5 w-5 shrink-0" style={{ color: col }} />
        </Tag>
      </div>
    );
  }

  if (h.template === "ticket") {
    return (
      <div style={cq}>
        <Tag {...linkProps} className="relative flex overflow-hidden rounded-[10px]" style={{ background: `color-mix(in srgb, ${col} 9%, white)`, border: `1.5px solid color-mix(in srgb, ${col} 35%, white)` }}>
          <div className="flex w-[34%] shrink-0 flex-col items-center justify-center px-2 py-4 text-center text-white" style={{ background: col }}>
            <span className="font-black leading-none" style={{ fontSize: "clamp(20px,7cqw,40px)" }}>{c.offer.replace(" OFF", "")}</span>
            {c.offer.endsWith("OFF") && <span className="mt-1 font-bold tracking-[0.2em]" style={{ fontSize: "clamp(10px,2.6cqw,13px)" }}>OFF</span>}
          </div>
          {/* tear line with notches */}
          <span aria-hidden className="relative w-0 border-l-2 border-dashed" style={{ borderColor: `color-mix(in srgb, ${col} 45%, white)` }}>
            <span className="absolute -left-[9px] -top-[9px] h-4 w-4 rounded-full bg-white" />
            <span className="absolute -bottom-[9px] -left-[9px] h-4 w-4 rounded-full bg-white" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-4 py-3">
            <span className="font-extrabold leading-tight text-[#353543]" style={{ fontSize: "clamp(15px,4.4cqw,24px)" }}>{title}</span>
            <span className="text-[#616173]" style={{ fontSize: "clamp(11px,3cqw,15px)" }}>{sub}</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-[6px] px-3 py-1.5 font-semibold text-white" style={{ background: col, fontSize: "clamp(11px,2.9cqw,14px)" }}>{h.cta}</span>
              <Timer />
            </span>
          </div>
        </Tag>
      </div>
    );
  }

  if (h.template === "soft") {
    return (
      <div style={cq}>
        <Tag {...linkProps} className="relative flex items-center gap-4 overflow-hidden rounded-[10px] px-5 py-5" style={{ background: `color-mix(in srgb, ${col} 11%, white)` }}>
          <span aria-hidden className="absolute -right-8 -top-10 h-36 w-36 rounded-full" style={{ background: `color-mix(in srgb, ${col} 14%, white)` }} />
          <span aria-hidden className="absolute -bottom-12 right-16 h-28 w-28 rounded-full" style={{ background: `color-mix(in srgb, ${col} 8%, white)` }} />
          <div className="relative min-w-0 flex-1">
            <p className="font-bold uppercase tracking-[0.12em]" style={{ color: col, fontSize: "clamp(10px,2.7cqw,13px)" }}>Limited time offer</p>
            <p className="mt-1 font-extrabold leading-tight text-[#353543]" style={{ fontSize: "clamp(17px,5cqw,30px)" }}>{title}</p>
            <p className="mt-1 text-[#616173]" style={{ fontSize: "clamp(11px,3cqw,15px)" }}>{sub}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-[6px] px-4 py-2 font-semibold text-white" style={{ background: col, fontSize: "clamp(11px,3cqw,14px)" }}>{h.cta}</span>
              <Timer />
            </div>
          </div>
          <div className="relative shrink-0 text-center font-black leading-none" style={{ color: col, fontSize: "clamp(24px,9cqw,56px)" }}>
            {c.offer.replace(" OFF", "")}{c.offer.endsWith("OFF") && <span className="block font-extrabold tracking-[0.15em]" style={{ fontSize: "0.34em" }}>OFF</span>}
          </div>
        </Tag>
      </div>
    );
  }

  if (h.template === "festive") {
    return (
      <div style={cq}>
        <Tag {...linkProps} className="relative flex items-center gap-4 overflow-hidden rounded-[10px] bg-[#1d1b2e] px-5 py-5 text-white">
          <span aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(circle at 12% 20%, #f5c451 1.2px, transparent 1.6px), radial-gradient(circle at 70% 75%, #f5c451 1px, transparent 1.4px), radial-gradient(circle at 88% 18%, #fff 1px, transparent 1.4px), radial-gradient(circle at 40% 85%, #fff 0.9px, transparent 1.3px)", backgroundSize: "70px 60px, 90px 70px, 60px 80px, 110px 90px" }} />
          <span aria-hidden className="absolute -left-10 -top-10 h-40 w-40 rounded-full blur-2xl" style={{ background: `${col}88` }} />
          <div className="relative min-w-0 flex-1">
            <p className="font-bold uppercase tracking-[0.18em] text-[#f5c451]" style={{ fontSize: "clamp(10px,2.7cqw,13px)" }}>✦ Special offer ✦</p>
            <p className="mt-1 font-extrabold leading-tight" style={{ fontSize: "clamp(17px,5cqw,30px)" }}>{title}</p>
            <p className="mt-1 text-white/75" style={{ fontSize: "clamp(11px,3cqw,15px)" }}>{sub}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-[6px] bg-[#f5c451] px-4 py-2 font-bold text-[#1d1b2e]" style={{ fontSize: "clamp(11px,3cqw,14px)" }}>{h.cta}</span>
              <Timer dark />
            </div>
          </div>
          <div className="relative shrink-0 text-center font-black leading-none text-[#f5c451]" style={{ fontSize: "clamp(24px,9cqw,56px)" }}>
            {c.offer.replace(" OFF", "")}{c.offer.endsWith("OFF") && <span className="block tracking-[0.15em]" style={{ fontSize: "0.34em" }}>OFF</span>}
          </div>
        </Tag>
      </div>
    );
  }

  // bold (default)
  return (
    <div style={cq}>
      <Tag {...linkProps} className="relative flex items-center gap-4 overflow-hidden rounded-[10px] px-5 py-5 text-white" style={{ background: `linear-gradient(120deg, ${col}, color-mix(in srgb, ${col} 60%, #ff7a45))` }}>
        <span aria-hidden className="absolute -right-6 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <span aria-hidden className="absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative min-w-0 flex-1">
          <p className="font-extrabold leading-tight" style={{ fontSize: "clamp(17px,5cqw,30px)" }}>{title}</p>
          <p className="mt-1 text-white/85" style={{ fontSize: "clamp(11px,3cqw,15px)" }}>{sub}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-[6px] bg-white px-4 py-2 font-bold" style={{ color: col, fontSize: "clamp(11px,3cqw,14px)" }}>{h.cta}</span>
            <Timer />
          </div>
        </div>
        <div className="relative shrink-0 text-center font-black leading-none" style={{ fontSize: "clamp(26px,10cqw,60px)" }}>
          {c.offer.replace(" OFF", "")}{c.offer.endsWith("OFF") && <span className="block tracking-[0.15em]" style={{ fontSize: "0.34em" }}>OFF</span>}
        </div>
      </Tag>
    </div>
  );
}

/** "2d 5h", "3h 12m", "8m 04s" until the end; null when there's no end (or it has passed). */
function useCountdown(endsAt: string | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt || now === null) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86_400_000), hh = Math.floor(ms / 3_600_000) % 24, mm = Math.floor(ms / 60_000) % 60, ss = Math.floor(ms / 1000) % 60;
  return d > 0 ? `${d}d ${hh}h` : hh > 0 ? `${hh}h ${String(mm).padStart(2, "0")}m` : `${mm}m ${String(ss).padStart(2, "0")}s`;
}

/** The homepage block: one banner, or a swipeable slider when there are several. */
export function CampaignOffers({ items }: { items: CampaignBannerData[] }) {
  const [i, setI] = useState(0);
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!track || items.length < 2) return;
    const t = setInterval(() => {
      const next = (Math.round(track.scrollLeft / track.clientWidth) + 1) % items.length;
      track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(t);
  }, [track, items.length]);
  if (items.length === 0) return null;
  if (items.length === 1) return <div className="px-4 py-3 shop:px-0"><CampaignBanner c={items[0]} /></div>;
  return (
    <div className="py-3">
      <div ref={setTrack} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((c) => <div key={c.id} className="w-full shrink-0 snap-center px-4 shop:px-0"><CampaignBanner c={c} /></div>)}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {items.map((c, k) => (
          <button key={c.id} type="button" aria-label={`Offer ${k + 1}`} onClick={() => track?.scrollTo({ left: k * track.clientWidth, behavior: "smooth" })}
            className="h-1.5 rounded-full transition-all" style={{ width: k === i ? 18 : 6, background: k === i ? "var(--hp-accent, #9f2089)" : "#d4d4de" }} />
        ))}
      </div>
    </div>
  );
}
