import type { SocialPlatform } from "@/types/shop";

/**
 * Verified verbatim (path data only) from the $SOCIAL_ICON_SVG map in
 * shop/includes/shop-footer.php. Rendered as inline <svg> in React below.
 */
export function SocialIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  switch (platform) {
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <path d="M13.5 21v-7.2h2.4l.35-2.8h-2.75V9.2c0-.8.22-1.35 1.38-1.35H16.4V5.35C16.1 5.32 15.1 5.2 13.9 5.2c-2.4 0-4.05 1.47-4.05 4.15v2.65H7.4v2.8h2.45V21h3.65Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <rect x="4.5" y="4.5" width="15" height="15" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="16.3" cy="7.7" r="1" fill="currentColor" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <rect x="3.5" y="6.5" width="17" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path fill="currentColor" d="M10.3 9.6v4.8l4.3-2.4-4.3-2.4Z" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <rect x="11" y="4" width="2" height="16" rx="1" transform="rotate(45 12 12)" />
          <rect x="11" y="4" width="2" height="16" rx="1" transform="rotate(-45 12 12)" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <rect x="5.3" y="10.2" width="2.6" height="8" />
          <circle cx="6.6" cy="6.9" r="1.5" />
          <path d="M10.5 10.2h2.5v1.3c.5-.85 1.5-1.5 2.8-1.5 2.1 0 3.3 1.4 3.3 4v4.2h-2.6v-3.8c0-1-.4-1.8-1.4-1.8-.85 0-1.4.6-1.6 1.1-.1.25-.1.55-.1.85v3.65h-2.6v-8Z" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <path d="M12 4a8 8 0 0 0-6.9 12l-1 3.6 3.7-1A8 8 0 1 0 12 4Zm4.6 11.4c-.2.6-1.1 1.1-1.6 1.2-.4.05-1 .07-1.6-.1-.35-.1-.8-.25-1.4-.5-2.4-1.05-4-3.5-4.1-3.65-.12-.16-1-1.3-1-2.5 0-1.2.6-1.8.85-2.05.2-.4.35-.4.5-.4h.4c.15 0 .3 0 .45.35.15.35.55 1.35.6 1.45.05.1.1.2 0 .35s-.15.25-.25.4c-.1.1-.2.25-.3.35-.1.1-.2.25-.1.45.15.25.6 1 1.3 1.6.9.8 1.6 1.05 1.9 1.15.25.1.4.1.55-.05.15-.15.6-.7.75-.95.15-.25.3-.2.5-.1.2.1 1.35.65 1.6.75.25.1.4.15.45.25.05.1.05.6-.15 1.15Z" />
        </svg>
      );
    case "pinterest":
      return (
        <svg viewBox="0 0 24 24" className={className}>
          <path d="M12.2 3.5c-4.7 0-7.1 3.4-7.1 6.2 0 1.7.6 3.2 2 3.8.2.1.4 0 .5-.2l.2-.8c.1-.2 0-.3-.1-.5-.4-.5-.7-1.1-.7-2 0-2.6 1.9-4.9 5-4.9 2.7 0 4.2 1.7 4.2 3.9 0 2.9-1.3 5.4-3.2 5.4-1.1 0-1.8-.9-1.6-2 .3-1.3.9-2.7.9-3.6 0-.8-.4-1.5-1.4-1.5-1.1 0-2 1.1-2 2.7 0 1 .3 1.6.3 1.6l-1.3 5.6c-.4 1.7-.1 3.7 0 3.9 0 .1.2.2.3.1.1-.2 1.4-1.8 1.9-3.4l.7-2.8c.4.7 1.4 1.3 2.5 1.3 3.3 0 5.6-3 5.6-7.1 0-3-2.6-5.9-6.6-5.9Z" />
        </svg>
      );
    default:
      return null;
  }
}
