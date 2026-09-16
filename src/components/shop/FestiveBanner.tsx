"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

export interface FestiveBannerData {
  id: number;
  bannerText: string | null;
  bannerImage: string | null;
  title: string | null;
  dismissible: boolean;
}

/**
 * Verified against .festive-banner CSS in shop-header.php (lines 444-465) —
 * REBUILT after discovering the first pass used the storefront's green-light
 * background, when the real design is a warm cream/orange gradient
 * (#fdf3e3 → #fffaf0) with dark-orange heading text (#8a3b12) and two large
 * decorative leaf emoji ABSOLUTELY POSITIONED in the top-left and top-right
 * corners (60px font-size, mirrored on the left side) — not inline beside
 * the heading text as the first pass rendered them.
 */
export function FestiveBanner({ banner }: { banner: FestiveBannerData }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const list: number[] = JSON.parse(sessionStorage.getItem("dismissedHomeBanners") || "[]");
      if (list.includes(banner.id)) setDismissed(true);
    } catch {
      /* ignore */
    }
  }, [banner.id]);

  function dismiss() {
    setDismissed(true);
    try {
      const list: number[] = JSON.parse(sessionStorage.getItem("dismissedHomeBanners") || "[]");
      list.push(banner.id);
      sessionStorage.setItem("dismissedHomeBanners", JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  if (dismissed) return null;

  return (
    <div
      className="relative rounded-xl overflow-hidden mb-9 mx-8 px-10 py-10 text-center"
      style={{ background: "linear-gradient(120deg,#fdf3e3,#fffaf0)" }}
    >
      {banner.dismissible && (
        <button onClick={dismiss} aria-label="Dismiss" className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-white/80 hover:bg-white flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      )}

      {banner.bannerImage ? (
        <Link href={banner.bannerText || "#"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/${banner.bannerImage}`} alt="" className="w-full h-auto block rounded-xl" />
        </Link>
      ) : (
        <>
          <span className="absolute top-2.5 left-5 text-[60px] opacity-85 -scale-x-100 select-none pointer-events-none">🌿</span>
          <span className="absolute top-2.5 right-5 text-[60px] opacity-85 select-none pointer-events-none">🌿</span>
          <h2 className="relative z-[1] text-[30px] tracking-wide" style={{ color: "#8a3b12" }}>
            {banner.bannerText || banner.title}
          </h2>
        </>
      )}
    </div>
  );
}
