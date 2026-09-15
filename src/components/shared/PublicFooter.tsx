import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface PublicFooterProps {
  siteName: string;
  tagline: string;
}

/** Verified against components/footer.php — includes the decorative wave SVG,
 *  legal links, copyright, and the "Designed & Developed by" credit line. */
export function PublicFooter({ siteName, tagline }: PublicFooterProps) {
  return (
    <footer className="relative mt-16" role="contentinfo">
      <div aria-hidden className="absolute -top-[69px] left-0 w-full overflow-hidden leading-none">
        <svg viewBox="0 0 1440 70" preserveAspectRatio="none" className="w-full h-[70px]">
          <path d="M0,55 C240,10 480,70 720,40 C960,10 1200,65 1440,45 L1440,0 L0,0 Z" fill="#faf7ff" />
        </svg>
      </div>

      <div className="bg-[#faf7ff] px-6 py-10">
        <div className="max-w-container-lg mx-auto flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div>
            <div className="text-xl font-black">{siteName}</div>
            <p className="text-sm text-storefront-muted mt-2 max-w-sm">{tagline}</p>
          </div>

          <nav aria-label="Footer Navigation">
            <ul className="flex flex-col md:flex-row gap-3 md:gap-6 text-sm">
              <li><Link href="/terms-of-service">Terms</Link></li>
              <li><Link href="/privacy-policy">Privacy Policy</Link></li>
              <li><Link href="/editorial-policy">Editorial Policy</Link></li>
              <li><Link href="/cookie-policy">Cookies Policy</Link></li>
            </ul>
          </nav>
        </div>

        <div className="max-w-container-lg mx-auto flex flex-col md:flex-row items-center justify-between gap-3 mt-8 pt-6 border-t border-black/10 text-sm text-storefront-muted">
          <p>© {new Date().getFullYear()} {siteName}. All rights reserved.</p>
          <a
            href="https://www.instagram.com/immanish.40"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5"
          >
            <ArrowRight className="w-4 h-4" />
            Designed &amp; Developed by <b>Manish Dhaker</b>
          </a>
        </div>
      </div>
    </footer>
  );
}
