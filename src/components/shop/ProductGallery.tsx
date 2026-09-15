"use client";

import { useState, useRef } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const startX = useRef(0);

  const slides = images.length > 0 ? images : [null];

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.changedTouches[0].screenX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const delta = e.changedTouches[0].screenX - startX.current;
    if (Math.abs(delta) < 40) return;
    setActiveIndex((i) => (delta < 0 ? Math.min(i + 1, slides.length - 1) : Math.max(i - 1, 0)));
  }

  return (
    <div>
      <div
        className="relative aspect-square rounded-lg border border-storefront-border bg-storefront-bg flex items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {slides[activeIndex] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/${slides[activeIndex]}`} alt={name} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-16 h-16 text-storefront-muted" />
        )}
      </div>
      {slides.length > 1 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {slides.map((s, i) =>
            s ? (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={cn("w-16 h-16 rounded-md overflow-hidden border-2 shrink-0", i === activeIndex ? "border-storefront-green" : "border-storefront-border")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/${s}`} alt="" className="w-full h-full object-cover" />
              </button>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
