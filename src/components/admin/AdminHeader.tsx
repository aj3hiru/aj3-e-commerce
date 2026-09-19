"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faMoon, faSun, faUserEdit, faSignOutAlt } from "@fortawesome/free-solid-svg-icons";
import { GlobalSearchBar } from "./GlobalSearchBar";
import { cn } from "@/lib/utils";

interface AdminHeaderProps {
  siteName: string;
  pageTitle: string;
  pageSubtitle?: string;
  username: string;
  role: string;
  /** Show the search box. EduMint has it on the dashboard and billing only. */
  showSearch?: boolean;
  /** Page-specific controls placed at the start of the right-hand group. */
  headerActions?: React.ReactNode;
  onMenuToggle: () => void;
}

/** localStorage key the PHP uses for dark mode ("1" = on). Kept identical so
 *  a preference set on the old admin carries over. */
const DM_KEY = "dm";

/**
 * The admin `.top-nav`, ported from ecom-head.php + header-user.php.
 *
 * Height note — the part that is easy to get wrong. The PHP pages load
 * Bootstrap, whose reboot sets `h1 { margin-bottom:.5rem; line-height:1.2 }`
 * and `p { margin-bottom:1rem }`. ecom-head.php's `* { margin:0 }` does NOT
 * cancel those: `*` has zero specificity and loses to an element selector.
 * So the real header is the title (1.5rem × 1.2) + 8px + the subtitle
 * (.875rem × 1.5) + 16px, inside .45rem padding — about 88px on desktop.
 * Dropping those two margins, as the first port did, makes it ~72px.
 *
 *   .top-nav       { padding:.45rem; border-bottom gray-200; gap:1rem; z 100 }
 *   .menu-toggle   { 40×40; gray-100; radius .5rem; 1.125rem; gray-700 } <1024 only
 *   .sitename-mob  { 1.15rem / 800 / primary }                          <768 only
 *   .nav-right     { gap:.75rem }
 *   .icon-btn      { 40×40; radius .5rem; 1.125rem } + primary-lighter/primary
 *   .header-user   { pill; bg gray-50; padding:.4rem .75rem .4rem .4rem; gap:.7rem }
 */
export function AdminHeader({
  siteName, pageTitle, pageSubtitle, username, role, showSearch, headerActions, onMenuToggle,
}: AdminHeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [dmBusy, setDmBusy] = useState(false);
  const [iconSpin, setIconSpin] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the user menu on any outside click, like header-user.php.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // Restore dark mode on load. DarkReader is imported lazily so the ~100KB
  // library is only fetched for admins who actually use dark mode.
  useEffect(() => {
    let on = false;
    try {
      on = window.localStorage.getItem(DM_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    if (!on) return;
    setDarkMode(true);
    import("darkreader").then((DR) => DR.enable({ brightness: 100, contrast: 100, sepia: 10 }));
  }, []);

  async function toggleDarkMode() {
    if (dmBusy) return;
    setDmBusy(true);
    const next = !darkMode;
    try {
      const DR = await import("darkreader");
      // Same settings as the PHP: DarkReader.enable({brightness:100, contrast:100, sepia:10})
      if (next) DR.enable({ brightness: 100, contrast: 100, sepia: 10 });
      else DR.disable();
      setDarkMode(next);
      try {
        window.localStorage.setItem(DM_KEY, next ? "1" : "0");
      } catch {
        /* storage blocked — still applies for this page */
      }
      // The icon does a half-turn as it swaps, as in the PHP.
      setIconSpin(true);
      setTimeout(() => setIconSpin(false), 400);
    } finally {
      setTimeout(() => setDmBusy(false), 600);
    }
  }

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "";

  return (
    <header className="sticky top-0 z-[100] flex items-center justify-between gap-4 border-b border-[#e5e7eb] bg-white p-[0.45rem]">
      {/* .nav-left */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-[0.5rem] bg-[#f3f4f6] text-[1.125rem] text-[#374151] transition-all duration-200 hover:bg-[#e5e7eb] lg:hidden"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
        <span className="block text-[1.15rem] font-extrabold text-[#7c3aed] md:hidden">{siteName}</span>
        {/* .page-heading-mini — note the Bootstrap h1/p margins, see above */}
        <div className="hidden md:block">
          <h1 className="mb-2 text-[1.5rem] font-bold leading-[1.2] text-[#111827]">{pageTitle}</h1>
          {pageSubtitle && <p className="mb-4 text-[0.875rem] leading-[1.5] text-[#6b7280]">{pageSubtitle}</p>}
        </div>
      </div>

      {/* .nav-right */}
      <div className="flex items-center gap-3">
        {headerActions}
        {showSearch && <GlobalSearchBar />}

        {/* .icon-btn.dark-mode-toggle */}
        <button
          type="button"
          onClick={toggleDarkMode}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          aria-pressed={darkMode}
          className="flex h-10 w-10 items-center justify-center rounded-[0.5rem] bg-[#f5f3ff] text-[1.125rem] text-[#7c3aed] transition-all duration-200"
        >
          <span className={cn("inline-block transition-transform duration-[400ms] ease-in-out", iconSpin && "rotate-180")}>
            <FontAwesomeIcon icon={darkMode ? faSun : faMoon} />
          </span>
        </button>

        {/* .header-user-wrap */}
        <div className="relative inline-block" ref={wrapRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setUserMenuOpen((o) => !o);
            }}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            className="flex cursor-pointer items-center gap-[0.7rem] rounded-full border-none bg-[#f9fafb] py-[0.4rem] pl-[0.4rem] pr-3 transition-colors duration-150 hover:bg-[#f3f4f6] max-[480px]:p-[0.3rem]"
          >
            {/* .avatar */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] text-[0.9375rem] font-bold text-white">
              {username.charAt(0).toUpperCase()}
            </span>
            {/* .info — hidden on phones */}
            <span className="text-left leading-[1.25] max-[480px]:hidden">
              <span className="block whitespace-nowrap text-[0.875rem] font-bold text-[#111827]">{username}</span>
              <span className="block text-[0.75rem] text-[#6b7280]">{roleLabel}</span>
            </span>
          </button>

          {/* .header-user-menu — the arrow on top comes from ::before in globals.css */}
          {userMenuOpen && (
            <ul
              role="menu"
              className="header-user-menu absolute right-0 top-full z-[1000] mt-3 min-w-[190px] list-none rounded-[0.5rem] border border-black/[0.08] bg-white p-[0.35rem] shadow-[0_0.5rem_1.5rem_rgba(0,0,0,0.15)]"
            >
              <li>
                <Link
                  href="/admin/my-profile"
                  role="menuitem"
                  className="flex items-center gap-[0.6rem] rounded-[0.4rem] px-[0.65rem] py-[0.55rem] text-[0.875rem] leading-[1.2] text-[#1f2937] hover:bg-[#f9fafb]"
                >
                  <span className="w-4 shrink-0 text-center"><FontAwesomeIcon icon={faUserEdit} /></span>
                  Edit Profile
                </Link>
              </li>
              <li>
                <hr className="mx-[0.35rem] my-1 border-0 border-t border-[#f3f4f6]" />
              </li>
              <li>
                {/* POST, never a link: Next.js prefetches <Link> targets in the
                    viewport, and a prefetchable logout URL was signing admins
                    out in the background. See api/auth/logout/route.ts. */}
                <form method="POST" action="/api/auth/logout">
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-[0.6rem] rounded-[0.4rem] px-[0.65rem] py-[0.55rem] text-left text-[0.875rem] leading-[1.2] text-[#1f2937] hover:bg-[#f9fafb]"
                  >
                    <span className="w-4 shrink-0 text-center"><FontAwesomeIcon icon={faSignOutAlt} /></span>
                    Logout
                  </button>
                </form>
              </li>
            </ul>
          )}
        </div>
      </div>
    </header>
  );
}
