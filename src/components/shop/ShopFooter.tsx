import Link from "next/link";
import { ChevronRight, Mail, MapPin, Phone, Rss } from "lucide-react";
import { SocialIcon } from "./SocialIcon";
import type { ShopBusinessSettings } from "@/types/shop";
import type { FooterConfig } from "@/types/storefront";
import { cn } from "@/lib/utils";

interface ShopFooterProps {
  business: ShopBusinessSettings;
  footer: FooterConfig;
}

/** WhatsApp glyph for the "Join Now" button (the reference's default button icon). */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35ZM12.04 21.8h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.71.97.99-3.62-.23-.37a9.78 9.78 0 0 1-1.5-5.22c0-5.41 4.41-9.81 9.83-9.81 2.62 0 5.09 1.02 6.94 2.88a9.75 9.75 0 0 1 2.87 6.94c0 5.41-4.41 9.81-9.82 9.81Zm8.36-18.17A11.75 11.75 0 0 0 12.04.17C5.52.17.22 5.46.22 11.97c0 2.08.54 4.11 1.58 5.9L.12 24l6.28-1.65a11.8 11.8 0 0 0 5.63 1.43h.01c6.52 0 11.82-5.3 11.82-11.81a11.74 11.74 0 0 0-3.46-8.34Z" />
    </svg>
  );
}

/**
 * The storefront footer, built from footer-design-reference (components/footer.php):
 * brand · link columns (+ a "Get in Touch" contact column) · "Follow Us" card with
 * a pill button and a row of white social icons · copyright. Same grid as the
 * reference: 1.5fr / 2fr / 1.5fr on desktop, two columns on tablet, one on mobile.
 * Text, links and colours come from Business Settings → Footer; contact details
 * and social links from Business Settings → Contact / Social Media.
 */
export function ShopFooter({ business, footer }: ShopFooterProps) {
  const phone = business.contactNumbers?.find(Boolean);
  const whatsapp = business.socialMedia?.find((s) => s.platform === "whatsapp")?.url;
  const ctaUrl = footer.ctaButtonUrl || whatsapp || (phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : "");
  const description = footer.description || business.tagline || "";
  const copyright = footer.copyright.replace(/\{year\}/g, String(new Date().getFullYear())).replace(/\{name\}/g, business.businessName);
  const contact = [
    phone && { key: "phone", icon: Phone, label: phone, href: `tel:${phone.replace(/[^\d+]/g, "")}` },
    business.email && { key: "mail", icon: Mail, label: business.email, href: `mailto:${business.email}` },
    business.address && { key: "addr", icon: MapPin, label: business.address, href: "" },
  ].filter(Boolean) as { key: string; icon: typeof Phone; label: string; href: string }[];
  const columns = [
    ...footer.columns,
    ...(footer.showContactColumn && contact.length ? [{ id: "contact", title: footer.contactTitle, links: [] }] : []),
  ];
  const socials = business.socialMedia?.filter((s) => s.url) ?? [];

  const heading = "mb-5 inline-flex w-max border-b pb-[5px] text-lg font-semibold text-white";
  const linkCls = "mb-2.5 inline-flex items-center gap-2 text-[15px] text-white transition-colors duration-300 hover:text-[var(--ftx-accent)]";

  return (
    <footer role="contentinfo" data-hc="footer" className="relative mt-10 md:mt-20"
      style={{ background: footer.bgColor, ["--ftx-accent" as string]: footer.accentColor }}>
      <div className="mx-auto max-w-[1200px] px-4 pb-6 pt-6 md:px-5 md:pt-10 xl:px-2.5 xl:pb-5">
        <div className="grid grid-cols-1 gap-[30px] border-b border-white/[0.18] pb-5 md:grid-cols-2 md:gap-5 min-[1025px]:grid-cols-[1.5fr_2fr_1.5fr] min-[1025px]:gap-10">
          {/* Brand */}
          <div className="flex flex-col">
            {business.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/${business.logo}`} alt={business.businessName} loading="lazy" className="mb-2.5 h-auto w-[180px] max-w-full object-contain" />
            ) : (
              <span className="mb-2.5 text-2xl font-extrabold text-white">{business.businessName}</span>
            )}
            {description && <p className="m-0 text-sm leading-relaxed text-white">{description}</p>}
          </div>

          {/* Link columns */}
          {columns.length > 0 && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-5 md:gap-x-10">
              {columns.map((col) => (
                <div key={col.id} className="flex min-w-0 flex-col">
                  {col.title && <h2 className={heading} style={{ borderColor: footer.accentColor }}>{col.title}</h2>}
                  {col.id === "contact"
                    ? contact.map((c) => {
                        const inner = <><c.icon className="h-[0.95em] w-[0.95em] shrink-0" /><span className={cn("min-w-0 text-[14px]", c.key === "mail" ? "break-all" : "break-words")}>{c.label}</span></>;
                        return c.href
                          ? <a key={c.key} href={c.href} className={linkCls}>{inner}</a>
                          : <span key={c.key} className={linkCls.replace("hover:text-[var(--ftx-accent)]", "")}>{inner}</span>;
                      })
                    : col.links.map((l) => (
                        <Link key={l.id} href={l.href} {...(/^https?:/i.test(l.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={linkCls}>
                          <ChevronRight className="h-[0.85em] w-[0.85em] shrink-0" strokeWidth={3} /><span>{l.label}</span>
                        </Link>
                      ))}
                </div>
              ))}
            </div>
          )}

          {/* Follow us */}
          {(footer.ctaEnabled || socials.length > 0) && (
            <div className="flex flex-col">
              <h2 className={heading} style={{ borderColor: footer.accentColor }}>Follow Us</h2>
              {footer.ctaEnabled && (
                <div className="mb-[15px] rounded-[10px] border border-white px-2.5 py-[15px]">
                  <div className="mb-[15px] grid grid-cols-[1fr_4fr] gap-[5px]">
                    <div className="flex items-center justify-center"><Rss className="h-12 w-12 text-white" strokeWidth={2.2} /></div>
                    <div className="flex flex-col justify-center">
                      <div className="text-[17px] font-bold text-white">{footer.ctaTitle}</div>
                      <div className="text-xs font-semibold text-white">{footer.ctaSubtitle}</div>
                    </div>
                  </div>
                  {footer.ctaButtonLabel && ctaUrl && (
                    <a href={ctaUrl} target="_blank" rel="noopener nofollow"
                      className="flex w-full items-center justify-center gap-2 rounded-full py-[7px] text-[15px] font-bold text-white transition-[filter] duration-300 hover:brightness-110"
                      style={{ background: footer.ctaButtonColor }}>
                      <WhatsAppIcon className="h-[1.2em] w-[1.2em]" /> {footer.ctaButtonLabel}
                    </a>
                  )}
                </div>
              )}
              {socials.length > 0 && (
                <div className="flex flex-wrap items-center gap-[7px]">
                  {socials.map((s) => (
                    <a key={s.platform + s.url} href={s.url} target="_blank" rel="noopener nofollow" aria-label={s.platform}
                      className="inline-flex px-1 py-[7px] text-white">
                      <SocialIcon platform={s.platform} className="h-[1.3em] w-[1.3em] fill-white text-white" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="m-0 pt-5 text-center text-[13px] text-white">{copyright}</p>
      </div>
    </footer>
  );
}
