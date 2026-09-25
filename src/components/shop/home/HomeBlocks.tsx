"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Clock, Gift, MapPin, Tag, Truck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BannerSlide, InfoStrip, StripIcon } from "@/types/home";

const src = (img: string) => (/^https:/.test(img) ? img : `/${img}`);
const STRIP_ICON: Record<StripIcon, typeof MapPin> = { pin: MapPin, truck: Truck, tag: Tag, gift: Gift, bolt: Zap, clock: Clock };

/** Meesho's "Add delivery location to check extra discount >>>" strip. */
export function InfoStripBar({ strip }: { strip: InfoStrip }) {
  if (!strip.enabled || !strip.text) return null;
  const Icon = STRIP_ICON[strip.icon];
  const inner = (
    <>
      <Icon className="strip-hop h-[18px] w-[18px] shrink-0 text-[#5d7eea]" fill={strip.icon === "pin" ? "#8aa4f4" : "none"} strokeWidth={strip.icon === "pin" ? 1.6 : 2} />
      <span className="min-w-0 truncate text-[13px] font-medium text-[#353543]">{strip.text}</span>
      <svg viewBox="0 0 26 12" className="strip-flow h-3 w-[26px] shrink-0" aria-hidden fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2l4 4-4 4" stroke="#8b8ba3" /><path d="M10 2l4 4-4 4" stroke="#8b8ba3" /><path d="M18 2l4 4-4 4" stroke="#8b8ba3" />
      </svg>
    </>
  );
  const cls = "flex h-[38px] items-center gap-2 bg-[#f8f9fe] px-4";
  return strip.href ? <Link href={strip.href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/** Swipeable banner slider with autoplay and dots. */
export function HomeBanner({ slides, autoplay, rounded }: { slides: BannerSlide[]; autoplay: number; rounded: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const paused = useRef(false);

  useEffect(() => {
    if (slides.length < 2 || autoplay <= 0) return;
    const t = setInterval(() => {
      const el = track.current;
      if (!el || paused.current) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, autoplay * 1000);
    return () => clearInterval(t);
  }, [slides.length, autoplay]);

  if (slides.length === 0) return null;
  return (
    <div className="px-3 pt-3 shop:px-0">
      <div ref={track} onScroll={(e) => setActive(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onPointerDown={() => { paused.current = true; }} onPointerUp={() => { paused.current = false; }}
        className={cn("flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", rounded && "rounded-xl")}>
        {slides.map((s, i) => {
          // eslint-disable-next-line @next/next/no-img-element
          const img = <img src={src(s.image)} alt="" loading={i === 0 ? "eager" : "lazy"} className="block aspect-[2/1] w-full object-cover shop:aspect-[3.2/1]" />;
          return (
            <div key={s.id} className="w-full shrink-0 snap-center">
              {s.href ? <Link href={s.href} className="block">{img}</Link> : img}
            </div>
          );
        })}
      </div>
      {slides.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {slides.map((s, i) => <span key={s.id} className={cn("h-1.5 rounded-full transition-all", i === active ? "w-4 bg-[var(--hp-accent)]" : "w-1.5 bg-[#d5d5e0]")} />)}
        </div>
      )}
    </div>
  );
}

/** A single promotional image banner. */
export function ImageBanner({ image, href }: { image: string; href: string }) {
  if (!image) return null;
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={src(image)} alt="" loading="lazy" className="block w-full rounded-xl object-cover" />;
  return <div className="px-3 py-3 shop:px-0">{href ? <Link href={href}>{img}</Link> : img}</div>;
}

/** Meesho's 8px grey band between sections. */
export function SectionGap() {
  return <div className="h-2 bg-[#eaeaf2]" aria-hidden />;
}
