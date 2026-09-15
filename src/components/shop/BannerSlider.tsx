"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export interface SlideData {
  id: number;
  image: string;
  buttonLink: string;
}

/** Verified against the BANNER SLIDER markup in shop/index.php — auto-rotating
 *  slides with dot indicators and a counter. */
export function BannerSlider({ slides }: { slides: SlideData[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div className="relative rounded-lg overflow-hidden mb-4">
      <div className="relative aspect-[3/1] sm:aspect-[4/1]">
        {slides.map((slide, i) => (
          <Link
            key={slide.id}
            href={slide.buttonLink || "#"}
            className={`absolute inset-0 transition-opacity duration-500 ${i === active ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/${slide.image}`} alt="Banner" className="w-full h-full object-cover" />
          </Link>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/30 rounded-full px-2.5 py-1">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`w-1.5 h-1.5 rounded-full ${i === active ? "bg-white" : "bg-white/40"}`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
          <span className="text-white text-[10px] ml-1">{active + 1}/{slides.length}</span>
        </div>
      )}
    </div>
  );
}
