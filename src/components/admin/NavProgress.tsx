"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin bar at the top that starts the moment a link is clicked, so the
 * admin always shows it has heard the click while the next page loads.
 */
function Bar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setState("loading");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 15_000); // never stuck on screen
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 300);
  }, [pathname, params]);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[5000] h-[3px]">
      <div className={state === "loading" ? "h-full w-[80%] bg-[#7c3aed] transition-[width] duration-[8000ms] ease-out" : "h-full w-full bg-[#7c3aed] opacity-0 transition-[width,opacity] duration-300"}
        style={state === "loading" ? { animation: "navprog 8s ease-out" } : undefined} />
      <style>{"@keyframes navprog{from{width:0}to{width:80%}}"}</style>
    </div>
  );
}

export function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
