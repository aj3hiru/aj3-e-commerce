"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Menu, Moon, Sun, UserCog, LogOut } from "lucide-react";
import { GlobalSearchBar } from "./GlobalSearchBar";
import { cn } from "@/lib/utils";

interface AdminHeaderProps {
  siteName: string;
  pageTitle: string;
  pageSubtitle?: string;
  username: string;
  role: string;
  onMenuToggle: () => void;
}

export function AdminHeader({ siteName, pageTitle, pageSubtitle, username, role, onMenuToggle }: AdminHeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Self-contained close-on-outside-click, matches header-user.php behavior
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <header className="sticky top-0 bg-white border-b border-admin-gray-200 px-2.5 py-2.5 flex items-center justify-between gap-4 z-[100]">
      <div className="flex items-center gap-4">
        <button
          className="w-10 h-10 bg-admin-gray-100 rounded-lg flex items-center justify-center text-admin-gray-700 hover:bg-admin-gray-200 lg:hidden"
          onClick={onMenuToggle}
          aria-label="Open menu"
        >
          <Menu className="w-[1.125rem] h-[1.125rem]" />
        </button>
        <span className="text-[1.15rem] font-extrabold text-admin-primary lg:hidden">{siteName}</span>
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold text-admin-gray-900">{pageTitle}</h1>
          {pageSubtitle && <p className="text-sm text-admin-gray-500">{pageSubtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <GlobalSearchBar />

        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center bg-admin-primary-lighter text-admin-primary"
          onClick={() => setDarkMode((d) => !d)}
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun className="w-[1.125rem] h-[1.125rem]" /> : <Moon className="w-[1.125rem] h-[1.125rem]" />}
        </button>

        <div className="relative" ref={wrapRef}>
          <button
            className="flex items-center gap-2.5 pl-1 pr-3 py-1.5 rounded-full bg-admin-gray-50 hover:bg-admin-gray-100"
            onClick={() => setUserMenuOpen((o) => !o)}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br from-admin-primary to-admin-primary-dark">
              {username.charAt(0).toUpperCase()}
            </div>
            <div className="text-left leading-tight hidden sm:block">
              <div className="font-bold text-sm text-admin-gray-900">{username}</div>
              <div className="text-xs text-admin-gray-500">{role.charAt(0).toUpperCase() + role.slice(1)}</div>
            </div>
          </button>

          {userMenuOpen && (
            <ul className={cn(
              "absolute top-full right-0 mt-3 p-1.5 min-w-[190px] bg-white rounded-lg z-[1000]",
              "border border-black/10 shadow-lg"
            )}>
              <li>
                <Link href="/admin/my-profile" className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-admin-gray-800 hover:bg-admin-gray-50">
                  <UserCog className="w-4 h-4" /> Edit Profile
                </Link>
              </li>
              <li><hr className="my-1 mx-1.5 border-admin-gray-100" /></li>
              <li>
                {/* Real bug fixed here — root-caused on the sibling StoryTimes
                    CMS project: a plain <Link> to a logout endpoint gets
                    silently PREFETCHED by Next.js whenever it's in the
                    viewport (this dropdown is present on every admin page),
                    which was logging admins out in the background with
                    nobody clicking anything. Logout must be a real POST
                    form submission, never a GET-reachable link — see
                    src/app/api/auth/logout/route.ts for the matching fix. */}
                <form method="POST" action="/api/auth/logout">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-admin-gray-800 hover:bg-admin-gray-50 text-left"
                  >
                    <LogOut className="w-4 h-4" /> Logout
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
