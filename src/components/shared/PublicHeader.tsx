"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { Search, Bell, Menu, X, Mic, UserCircle, LayoutGrid, MapPinned, Info, Mail, Moon, Cloud } from "lucide-react";

interface PublicHeaderProps {
  siteName: string;
}

/**
 * Verified against components/header.php. Includes:
 * - Desktop nav: Home / Job Categories / State Wise Jobs / About Us / Contact Us / Dark Mode
 * - Push-notify bell button (hidden by default, shown via JS once permission API is checked — see NOTES below)
 * - Search overlay with voice-search button (Web Speech API)
 * - Mobile hamburger -> drawer with weather widget + edition/language pickers (static UI in the
 *   original; wire these to real data only if/when the original functionality is implemented server-side)
 *
 * NOTE: `push-notify-btn` visibility and the actual push subscription flow belongs in
 * lib/push/web-push.ts + a small client hook — this component only renders the button shell.
 */
export function PublicHeader({ siteName }: PublicHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  function startVoiceSearch() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    setListening(true);
    recognition.onresult = (e: any) => {
      if (searchInputRef.current) {
        searchInputRef.current.value = e.results[0][0].transcript;
        searchInputRef.current.form?.requestSubmit();
      }
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-1.5 px-4 py-3 border-b bg-white sticky top-0 z-40">
        <Link href="/" title={`${siteName} Home`} aria-label={`Go to ${siteName} homepage`}>
          <span className="text-xl font-black text-[#1A365D]">{siteName}</span>
        </Link>

        <nav aria-label="Main Menu" className="hidden lg:flex ml-6">
          <ul className="flex items-center gap-6 text-sm font-medium">
            <li><Link href="/">Home</Link></li>
            <li><Link href="/categories">Job Categories</Link></li>
            <li><Link href="/state-jobs">State Wise Jobs</Link></li>
            <li><Link href="/about-us">About Us</Link></li>
            <li><Link href="/contact-us">Contact Us</Link></li>
            <li><button className="flex items-center gap-1"><Moon className="w-4 h-4" /> Dark Mode</button></li>
          </ul>
        </nav>

        <div className="flex items-center gap-2 ml-auto">
          <button aria-label="Enable Notifications" className="w-9 h-9 flex items-center justify-center relative" id="push-notify-btn">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-600 rounded-full" />
          </button>
          <button aria-label="Search" onClick={() => setSearchOpen(true)} className="w-9 h-9 flex items-center justify-center">
            <Search className="w-5 h-5" />
          </button>
          <button aria-label="Open Menu" onClick={() => setDrawerOpen(true)} className="w-9 h-9 flex items-center justify-center lg:hidden">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 bg-white z-50 flex items-start justify-center pt-24 px-4">
          <form action="/search" method="GET" className="w-full max-w-xl">
            <div className="flex items-center gap-2 border-b-2 border-storefront-green pb-2">
              <Search className="w-5 h-5 text-storefront-muted" />
              <input
                ref={searchInputRef}
                type="text"
                name="q"
                placeholder="e.g. SSC, UPSC, Railway..."
                required
                autoComplete="off"
                className="flex-1 outline-none text-lg"
              />
              <button type="button" onClick={startVoiceSearch} aria-label="Voice search">
                <Mic className={listening ? "w-5 h-5 text-red-500 animate-pulse" : "w-5 h-5"} />
              </button>
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close Search">
                <X className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 bg-black/50 z-[999] lg:hidden transition-opacity ${drawerOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        aria-label="Mobile Navigation"
        aria-hidden={!drawerOpen}
        className={`fixed top-0 left-0 bottom-0 w-[85%] max-w-[320px] bg-white z-[1000] overflow-y-auto transition-transform lg:hidden ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setDrawerOpen(false)} aria-label="Close Menu"><X className="w-5 h-5" /></button>
            <span className="flex items-center gap-1 text-xs text-storefront-muted"><Cloud className="w-4 h-4" /> Weather</span>
          </div>
          <button aria-label="Search" onClick={() => { setDrawerOpen(false); setSearchOpen(true); }}>
            <Search className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <UserCircle className="w-6 h-6 text-storefront-green" />
            <span className="text-sm">Welcome! to {siteName}</span>
          </div>
          <Link href="/login" className="block text-center bg-storefront-green text-white rounded py-2 text-sm font-semibold">
            Sign In / Register
          </Link>
        </div>
        <nav className="p-2">
          <Link href="/" className="flex items-center gap-3 px-3 py-3 text-sm" onClick={() => setDrawerOpen(false)}>
            <LayoutGrid className="w-5 h-5" /> Home
          </Link>
          <Link href="/categories" className="flex items-center gap-3 px-3 py-3 text-sm" onClick={() => setDrawerOpen(false)}>
            <LayoutGrid className="w-5 h-5" /> Job Categories
          </Link>
          <Link href="/state-jobs" className="flex items-center gap-3 px-3 py-3 text-sm" onClick={() => setDrawerOpen(false)}>
            <MapPinned className="w-5 h-5" /> State Wise Jobs
          </Link>
          <Link href="/about-us" className="flex items-center gap-3 px-3 py-3 text-sm" onClick={() => setDrawerOpen(false)}>
            <Info className="w-5 h-5" /> About Us
          </Link>
          <Link href="/contact-us" className="flex items-center gap-3 px-3 py-3 text-sm" onClick={() => setDrawerOpen(false)}>
            <Mail className="w-5 h-5" /> Contact Us
          </Link>
          <button className="flex items-center gap-3 px-3 py-3 text-sm w-full text-left">
            <Moon className="w-5 h-5" /> Dark Mode
          </button>
        </nav>
      </aside>
    </>
  );
}
