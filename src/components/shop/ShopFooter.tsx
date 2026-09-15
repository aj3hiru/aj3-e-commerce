import Link from "next/link";
import { Phone, Mail, MapPin } from "lucide-react";
import { SocialIcon } from "./SocialIcon";
import type { ShopBusinessSettings } from "@/types/shop";

interface ShopFooterProps {
  business: ShopBusinessSettings;
}

/** Verified against shop/includes/shop-footer.php lines 82-157 (footer markup only —
 *  the mobile drawer that used to live in the same file is ShopMobileDrawer.tsx). */
export function ShopFooter({ business }: ShopFooterProps) {
  const firstNumber = business.contactNumbers?.[0];

  return (
    <footer className="bg-white border-t border-storefront-border mt-10">
      <div className="max-w-container-lg mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          {business.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/${business.logo}`} alt={business.businessName} className="h-10 mb-3" />
          ) : (
            <span className="text-lg font-bold">{business.businessName}</span>
          )}
          <p className="text-sm text-storefront-muted mt-2">
            {business.tagline || "Your everyday store — fresh products and daily essentials, delivered to your doorstep."}
          </p>
          {!!business.socialMedia?.length && (
            <div className="flex gap-3 mt-4">
              {business.socialMedia.map((s) => (
                <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.platform}>
                  <SocialIcon platform={s.platform} className="w-5 h-5" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="font-bold mb-3">Quick Links</h4>
          <ul className="space-y-2 text-sm text-storefront-muted">
            <li><Link href="/shop">Home</Link></li>
            <li><Link href="/shop#categories">All Categories</Link></li>
            <li><Link href="/shop/cart">My Cart</Link></li>
            <li><Link href="/shop/account">My Account</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-3">Get in Touch</h4>
          <ul className="space-y-2 text-sm text-storefront-muted">
            {firstNumber && (
              <li className="flex items-center gap-2"><Phone className="w-4 h-4" /> {firstNumber}</li>
            )}
            {business.email && (
              <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> {business.email}</li>
            )}
            {business.address && (
              <li className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {business.address}</li>
            )}
          </ul>
        </div>

        <div>
          <h4 className="font-bold mb-3">Customer Service</h4>
          <ul className="space-y-2 text-sm text-storefront-muted">
            <li><Link href="/shop/account">My Account</Link></li>
            <li><Link href="/shop/order">Track Order</Link></li>
            {business.returnPolicy && <li><Link href="/shop#returns">Returns &amp; Refunds</Link></li>}
          </ul>
        </div>
      </div>

      <div className="border-t border-storefront-border py-4 text-center text-sm text-storefront-muted">
        © {new Date().getFullYear()} {business.businessName}. All rights reserved.
      </div>
    </footer>
  );
}
