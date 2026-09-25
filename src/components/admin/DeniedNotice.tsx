"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (params?.get("denied") !== "1") return;
    setShow(true);
    // Tidy the address bar so a refresh doesn't show it again.
    const sp = new URLSearchParams(params.toString());
    sp.delete("denied");
    router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  }, [params, pathname, router]);
  if (!show) return null;
  return (
    <div role="alert" className="mb-4 flex items-center gap-2.5 rounded-[10px] border border-[#fcd34d] bg-[#fffbeb] px-4 py-3 text-[14px] text-[#92400e]">
      <ShieldAlert className="h-5 w-5 shrink-0" />
      <span className="flex-1">You don&rsquo;t have access to that page. Ask an admin if you need it.</span>
      <button type="button" onClick={() => setShow(false)} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-[6px] hover:bg-[#fef3c7]"><X className="h-4 w-4" /></button>
    </div>
  );
}

/** "You don't have access to that page" — shown after a page sends someone back here (?denied=1). */
export function DeniedNotice() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
