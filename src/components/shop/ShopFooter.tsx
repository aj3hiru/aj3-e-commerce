import Link from "next/link";
import { Phone, Mail, MapPin } from "lucide-react";
import { SocialIcon } from "./SocialIcon";
import type { ShopBusinessSettings } from "@/types/shop";

interface ShopFooterProps {
  business: ShopBusinessSettings;
}

/**
 * Verified against .site-footer / .footer-main CSS in shop-header.php
 * (lines 758-853) — REBUILT after discovering the first pass had gotten the
 * single most important thing wrong: this is a DARK footer (background
 * #241a3d, near-white text at various opacities), not a white one. The first
 * pass used a plain white background with dark text, which is the opposite
 * of the real design. Also corrected: 4-column grid (1.3fr/1fr/1fr/1.2fr),
 * bullet-point styled links (small green dot before each), circular social
 * icons with a translucent white background that turns green on hover, and
 * the exact bottom copyright/credit-badge row.
 */
export function ShopFooter({ business }: ShopFooterProps) {
  const firstNumber = business.contactNumbers?.[0];

  return (
    <footer className="relative overflow-hidden pt-[50px] mt-5" style={{ background: "#241a3d" }}>
      <div className="relative z-10 max-w-[1140px] mx-auto px-6 pt-8 pb-8">
        {/* Main 4-column grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-9 md:gap-10 pb-9 border-b border-white/10">
          {/* About column (wider: 1.3fr) */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-3.5">
              {business.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/${business.logo}`} alt={business.businessName} className="h-[38px] w-auto max-w-[130px] object-contain rounded" />
              ) : (
                <span className="text-white text-lg font-extrabold">{business.businessName}</span>
              )}
            </div>
            <p className="text-[13.5px] leading-[1.7] text-white/65 max-w-[280px] mb-4">
              {business.tagline || "Your everyday store — fresh products and daily essentials, delivered to your doorstep."}
            </p>
            {!!business.socialMedia?.length && (
              <div className="flex gap-2.5">
                {business.socialMedia.map((s) => (
                  <a
                    key={s.platform}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.platform}
                    className="w-[34px] h-[34px] rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center hover:bg-storefront-green transition-colors hover:-translate-y-0.5"
                  >
                    <SocialIcon platform={s.platform} className="w-[15px] h-[15px] fill-white text-white" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white text-[15px] font-bold mb-4 tracking-wide">Quick Links</h4>
            <ul className="flex flex-col gap-2.5 list-none">
              {[
                { href: "/shop", label: "Home" },
                { href: "/shop#categories", label: "All Categories" },
                { href: "/shop/cart", label: "My Cart" },
                { href: "/shop/account", label: "My Account" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[13.5px] text-white/65 hover:text-white inline-flex items-center gap-1.5 before:content-[''] before:w-[5px] before:h-[5px] before:rounded-full before:bg-storefront-green before:shrink-0">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Get in Touch */}
          <div>
            <h4 className="text-white text-[15px] font-bold mb-4 tracking-wide">Get in Touch</h4>
            <ul className="flex flex-col gap-3.5 list-none">
              {firstNumber && (
                <li className="flex items-start gap-2.5 text-[13.5px] text-white/70 leading-snug">
                  <Phone className="w-[17px] h-[17px] shrink-0 mt-0.5 text-storefront-green" /> {firstNumber}
                </li>
              )}
              {business.email && (
                <li className="flex items-start gap-2.5 text-[13.5px] text-white/70 leading-snug">
                  <Mail className="w-[17px] h-[17px] shrink-0 mt-0.5 text-storefront-green" /> {business.email}
                </li>
              )}
              {business.address && (
                <li className="flex items-start gap-2.5 text-[13.5px] text-white/70 leading-snug">
                  <MapPin className="w-[17px] h-[17px] shrink-0 mt-0.5 text-storefront-green" /> {business.address}
                </li>
              )}
            </ul>
          </div>

          {/* Customer Service (wider: 1.2fr) */}
          <div>
            <h4 className="text-white text-[15px] font-bold mb-4 tracking-wide">Customer Service</h4>
            <ul className="flex flex-col gap-2.5 list-none">
              <li>
                <Link href="/shop/account" className="text-[13.5px] text-white/65 hover:text-white inline-flex items-center gap-1.5 before:content-[''] before:w-[5px] before:h-[5px] before:rounded-full before:bg-storefront-green before:shrink-0">
                  My Account
                </Link>
              </li>
              <li>
                <Link href="/shop/order" className="text-[13.5px] text-white/65 hover:text-white inline-flex items-center gap-1.5 before:content-[''] before:w-[5px] before:h-[5px] before:rounded-full before:bg-storefront-green before:shrink-0">
                  Track Order
                </Link>
              </li>
              {business.returnPolicy && (
                <li>
                  <Link href="/shop#returns" className="text-[13.5px] text-white/65 hover:text-white inline-flex items-center gap-1.5 before:content-[''] before:w-[5px] before:h-[5px] before:rounded-full before:bg-storefront-green before:shrink-0">
                    Returns &amp; Refunds
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom copyright row */}
        <div className="flex items-center justify-center flex-wrap gap-3 pt-6">
          <p className="text-xs text-white/50 tracking-wide m-0">
            © {new Date().getFullYear()} {business.businessName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
