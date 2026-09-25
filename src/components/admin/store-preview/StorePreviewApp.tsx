"use client";

import { useEffect, useState } from "react";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { PhoneLogin } from "@/components/shop/auth/PhoneLogin";
import { LoginForm } from "@/components/shop/LoginForm";
import { Page } from "@/components/shop/ui/Meesho";
import type { ShopLayoutData } from "@/lib/shop-layout-data";
import { otpReady, type AuthSettings } from "@/types/auth-settings";
import { HIDE_SCROLLBARS, PREVIEW_MSG, type StorePreviewState } from "./types";

/**
 * Runs inside the preview frame. Starts from the saved store, then redraws
 * with whatever the admin screen posts (unsaved edits included). Links and
 * forms are inert so the frame never navigates away; on the login view
 * nothing is clickable at all, so no OTP is ever sent from a preview.
 */
export function StorePreviewApp({ initial, auth }: { initial: ShopLayoutData; auth: AuthSettings }) {
  const [live, setLive] = useState<StorePreviewState | null>(null);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== PREVIEW_MSG) return;
      setLive(e.data.state as StorePreviewState);
    };
    window.addEventListener("message", onMsg);
    window.parent?.postMessage({ type: `${PREVIEW_MSG}:ready` }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const view = live?.view ?? "store";
  const focus = live?.focus ?? "top";
  useEffect(() => {
    const t = setTimeout(() => {
      if (focus === "footer") document.querySelector("footer")?.scrollIntoView({ block: "end" });
      else window.scrollTo({ top: 0 });
    }, 60);
    return () => clearTimeout(t);
  }, [focus, live]);

  const stop = (e: React.SyntheticEvent) => {
    if (view === "login") { e.preventDefault(); e.stopPropagation(); return; }
    const t = e.target as HTMLElement;
    if (t.closest("a[href]") || e.type === "submit") e.preventDefault();
  };

  const storefront = live?.storefront ?? initial.storefront;
  const a = live?.auth ?? auth;
  const storeName = (live?.business ?? initial.business).businessName;
  return (
    <div onClickCapture={stop} onSubmitCapture={stop} onKeyDownCapture={view === "login" ? stop : undefined}>
      <style>{HIDE_SCROLLBARS}</style>
      <ShopLayout
        {...initial}
        business={live?.business ?? initial.business}
        header={live?.header ?? initial.header}
        // Never ask the admin's own browser for notification permission from the preview.
        storefront={{ ...storefront, push: { ...storefront.push, autoPrompt: false } }}
        customer={live?.loggedIn ? { id: 0, name: "Priya Sharma" } : null}
        previewDrawer={live ? !!live.drawer : undefined}
      >
        {view === "login" ? (
          otpReady(a)
            ? <PhoneLogin key={JSON.stringify(a)} firebase={a.firebase} countryCode={a.countryCode} passwordLogin={a.passwordLogin} storeName={storeName} />
            : <LoginForm storeName={storeName} />
        ) : view === "page" ? (
          <Page title={live?.page?.title || "Page title"} back="/">
            <article className="bg-white px-4 py-5 text-[15px] leading-7 text-[#353543] shop:px-8 shop:py-8">
              <div className="whitespace-pre-line break-words">{live?.page?.content || "Your page content appears here as you type."}</div>
            </article>
          </Page>
        ) : (
          <SampleHome categories={initial.categories.map((c) => c.name)} />
        )}
      </ShopLayout>
    </div>
  );
}

/** A light stand-in for the homepage, so the header and footer sit in context. */
function SampleHome({ categories }: { categories: string[] }) {
  const cats = (categories.length ? categories : ["Fashion", "Grocery", "Home", "Beauty", "Kids"]).slice(0, 6);
  return (
    <div className="-mx-8 -my-6 bg-white pb-6">
      <div className="mx-4 mt-3 grid h-[150px] place-items-center rounded-[8px] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--hp-accent)_18%,white),color-mix(in_srgb,var(--hp-accent)_6%,white))] text-center shop:mx-8 shop:h-[220px]">
        <div>
          <p className="text-[20px] font-extrabold text-[#353543] shop:text-[30px]">Lowest Prices, Best Quality</p>
          <span className="mt-2 inline-block rounded-[4px] bg-[var(--hp-accent)] px-4 py-2 text-[13px] font-semibold text-white">Shop Now</span>
        </div>
      </div>
      <div className="mt-4 flex gap-4 overflow-hidden px-4 shop:justify-center shop:px-8">
        {cats.map((c) => (
          <div key={c} className="w-[68px] shrink-0 text-center">
            <div className="mx-auto grid h-[58px] w-[58px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--hp-accent)_10%,white)] text-[18px] font-bold text-[var(--hp-accent)]">{c.charAt(0)}</div>
            <p className="mt-1 truncate text-[12px] text-[#353543]">{c}</p>
          </div>
        ))}
      </div>
      <p className="mb-3 mt-6 px-4 text-[18px] font-semibold text-[#353543] shop:px-8">Products For You</p>
      <div className="grid grid-cols-2 gap-2 px-2 shop:grid-cols-5 shop:gap-4 shop:px-8">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-[6px] border border-[#eaeaf2]">
            <div className="aspect-square bg-[#f3f3f7]" />
            <div className="space-y-1.5 p-2.5">
              <div className="h-3 w-4/5 rounded bg-[#ececf2]" />
              <div className="h-3 w-2/5 rounded bg-[#e2e2ea]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
