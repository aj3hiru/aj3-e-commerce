"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export interface SlideData {
  id: number;
  image: string;
  buttonLink: string;
}

/**
 * Verified against .banner-slider / .slider-dots CSS in shop-header.php
 * (lines 253-313) — REBUILT after discovering the first pass overlaid dots
 * on top of the image (position: absolute), when the real design renders
 * dots as a SEPARATE static row below the slider (position: static, its own
 * margin). Also corrected: no fixed aspect-ratio box — the real slide sizes
 * itself by `height:auto; max-height:340px` on the image, and only one slide
 * is ever in the DOM as `display:block` at a time rather than all slides
 * stacked with opacity transitions.
 */
export function BannerSlider({ slides }: { slides: SlideData[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div>
      <div className="relative mt-4 rounded-xl overflow-hidden" style={{ touchAction: "pan-y" }}>
        {slides.map((slide, i) =>
          i === active ? (
            <div key={slide.id} className="block">
              <Link href={slide.buttonLink || "#"} className="block leading-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/${slide.image}`} alt="Banner" className="w-full h-auto max-h-[340px] object-cover block rounded-xl" />
              </Link>
            </div>
          ) : null
        )}
      </div>
      {slides.length > 1 && (
        <div className="static mx-auto mt-3.5 mb-5 flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="w-[22px] h-[22px] p-0 border-none bg-transparent cursor-pointer flex items-center justify-center"
              aria-label={`Slide ${i + 1}`}
            >
              <span className={`w-2 h-2 rounded-full ${i === active ? "bg-[#333]" : "bg-black/25"}`} />
            </button>
          ))}
          <span className="bg-black/65 text-white text-xs font-bold px-3 py-1 rounded-full">
            {active + 1}/{slides.length}
          </span>
        </div>
      )}
    </div>
  );
}
