import { NextResponse } from "next/server";
import { BusyError } from "./work-queue";

/**
 * Every API route is wrapped in this (see the bottom of each route.ts), so an
 * unexpected problem always comes back as a short JSON answer the screen can
 * show — never a crashed request or an HTML error page:
 *  - the row was deleted meanwhile (two people, one item)  → 404
 *  - a value that must be unique already exists             → 409
 *  - it is still used by something else                     → 409
 *  - the request itself was unreadable                      → 400
 *  - anything else                                          → 500, logged on the server
 */
export function withApiErrors<A extends unknown[]>(handler: (...args: A) => Promise<Response | undefined> | Response | undefined) {
  return async (...args: A): Promise<Response> => {
    try {
      const res = await handler(...args);
      // A code path that forgot to answer: say so instead of leaving the request hanging / erroring.
      return res ?? NextResponse.json({ success: false, message: "Nothing to do for this request." }, { status: 400 });
    } catch (e) {
      // Next.js redirect() / notFound() travel as errors — let them through.
      const digest = (e as { digest?: unknown })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
      const json = (status: number, message: string) => NextResponse.json({ success: false, message }, { status });
      if (e instanceof BusyError) return NextResponse.json({ success: false, busy: true, message: e.message }, { status: 503, headers: { "Retry-After": "5" } });
      const code = (e as { code?: unknown })?.code;
      if (code === "P2024" || code === "P2034" || code === "P2028") {
        const r = args[0] as { method?: string; url?: string } | undefined;
        console.warn(`[api busy] ${code} ${r?.method ?? ""} ${r?.url ?? ""} ${e instanceof Error ? e.message.split("\n").slice(-2).join(" ").slice(0, 200) : ""}`);
        return json(503, "The shop is very busy right now. Please try again in a few seconds.");
      }
      if (code === "P2025") return json(404, "This item no longer exists. Please refresh the page.");
      if (code === "P2002") return json(409, "That value is already used by another item.");
      if (code === "P2003" || code === "P2014") return json(409, "It is still used by other records, so it can't be changed that way.");
      if (e instanceof SyntaxError || (e instanceof TypeError && /Body|Content-Type|JSON/i.test(e.message))) return json(400, "The request could not be read. Please try again.");
      const req = args[0] as { method?: string; url?: string } | undefined;
      console.error(`[api] ${req?.method ?? ""} ${req?.url ?? ""}`, e);
      return json(500, "Something went wrong. Please try again.");
    }
  };
}
