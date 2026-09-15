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

/** Verified against the festive_banner section markup + dismissHomeBanner() JS
 *  in shop/index.php — dismissal state persists in sessionStorage, keyed by
 *  section id, matching the original exactly. */
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
    <div className="relative rounded-xl bg-storefront-green-light overflow-hidden mb-5">
      {banner.dismissible && (
        <button onClick={dismiss} aria-label="Dismiss" className="absolute top-2.5 right-3.5 w-7 h-7 rounded-full bg-white/80 hover:bg-white flex items-center justify-center z-10">
          <X className="w-4 h-4" />
        </button>
      )}
      {banner.bannerImage ? (
        <Link href={banner.bannerText || "#"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/${banner.bannerImage}`} alt="" className="w-full h-auto block rounded-xl" />
        </Link>
      ) : (
        <div className="text-center py-8 px-4">
          <span className="text-xl mr-2">🌿</span>
          <h2 className="inline text-lg font-bold">{banner.bannerText || banner.title}</h2>
          <span className="text-xl ml-2">🌿</span>
        </div>
      )}
    </div>
  );
}
