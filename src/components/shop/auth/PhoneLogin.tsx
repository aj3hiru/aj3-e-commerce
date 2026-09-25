"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, MessageSquareText, Pencil, ShieldCheck, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthCard } from "@/components/shop/ui/AuthCard";
import { PasswordInput } from "@/components/shop/ui/PasswordInput";
import { Field, Notice, btnOutline, btnPrimary, inputCls } from "@/components/shop/ui/Meesho";
import { LoginForm } from "@/components/shop/LoginForm";
import type { FirebaseWebConfig } from "@/types/auth-settings";

/* Firebase's browser SDK, loaded from Google's CDN only on this page. */
const FB = "https://www.gstatic.com/firebasejs/10.12.5";
type Confirmation = { confirm: (code: string) => Promise<{ user: { getIdToken: () => Promise<string> } }> };
type FirebaseAuth = {
  signInWithPhoneNumber: (phone: string, verifier: unknown) => Promise<Confirmation>;
  signOut: () => Promise<void>;
  useDeviceLanguage: () => void;
};
type FirebaseNS = {
  apps: unknown[];
  initializeApp: (c: FirebaseWebConfig) => unknown;
  auth: (() => FirebaseAuth) & { RecaptchaVerifier: new (el: HTMLElement | string, opts: Record<string, unknown>) => { clear: () => void; render: () => Promise<number> } };
};
declare global { interface Window { firebase?: FirebaseNS } }

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error("Couldn't load the OTP service. Check your internet connection."));
    document.head.appendChild(s);
  });
}
async function firebaseAuth(config: FirebaseWebConfig): Promise<FirebaseNS> {
  await loadScript(`${FB}/firebase-app-compat.js`);
  await loadScript(`${FB}/firebase-auth-compat.js`);
  const fb = window.firebase!;
  if (!fb.apps.length) fb.initializeApp(config);
  return fb;
}

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/invalid-phone-number": "That mobile number doesn't look right.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/invalid-verification-code": "Incorrect OTP. Please check and try again.",
  "auth/code-expired": "This OTP has expired. Please request a new one.",
  "auth/quota-exceeded": "OTP limit reached for today. Please try again later or log in with password.",
  "auth/captcha-check-failed": "Verification check failed. Please refresh the page and try again.",
  "auth/network-request-failed": "Network error. Please check your internet connection.",
  "auth/unauthorized-domain": "This website isn't added in Firebase yet (Authentication → Settings → Authorized domains).",
  "auth/operation-not-allowed": "Phone sign-in isn't enabled in Firebase yet (Authentication → Sign-in method → Phone).",
  "auth/billing-not-enabled": "SMS needs billing enabled on the Firebase project (Blaze plan).",
};
const fbMessage = (e: unknown) => {
  const code = (e as { code?: string })?.code ?? "";
  return FIREBASE_ERRORS[code] ?? ((e as { message?: string })?.message?.replace(/^Firebase:\s*/, "") || "Something went wrong. Please try again.");
};

const RESEND_AFTER = 30;
type Mode = "phone" | "otp" | "password" | "staff";

/**
 * Login or sign up with a mobile number: OTP first (Firebase), with "use
 * password instead" and a staff/email login. New numbers get an account and
 * go straight to profile setup.
 */
export function PhoneLogin({ firebase, countryCode, passwordLogin, redirectTo, storeName }: {
  firebase: FirebaseWebConfig; countryCode: string; passwordLogin: boolean; redirectTo?: string; storeName: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [left, setLeft] = useState(0);
  const [autoReading, setAutoReading] = useState(false);
  const confirmation = useRef<Confirmation | null>(null);
  const verifier = useRef<{ clear: () => void } | null>(null);
  const captchaBox = useRef<HTMLDivElement>(null);
  const otpInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const full = `${countryCode}${phone}`;
  const valid = /^[6-9]\d{9}$/.test(phone) || (countryCode !== "+91" && /^\d{6,12}$/.test(phone));

  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((n) => n - 1), 1000); return () => clearTimeout(t); }, [left]);
  useEffect(() => () => { abort.current?.abort(); verifier.current?.clear(); }, []);
  // Warm up the SDK while the shopper types.
  useEffect(() => { firebaseAuth(firebase).catch(() => {}); }, [firebase]);

  async function sendOtp() {
    if (!valid) { setError("Please enter a valid 10-digit mobile number."); return; }
    setBusy(true); setError("");
    try {
      const fb = await firebaseAuth(firebase);
      const auth = fb.auth();
      auth.useDeviceLanguage();
      verifier.current?.clear();
      // Fresh invisible reCAPTCHA each time (a used one can't be reused).
      const box = document.createElement("div");
      captchaBox.current?.replaceChildren(box);
      const v = new fb.auth.RecaptchaVerifier(box, { size: "invisible" });
      verifier.current = v;
      confirmation.current = await auth.signInWithPhoneNumber(full, v);
      setOtp(""); setMode("otp"); setLeft(RESEND_AFTER);
      setTimeout(() => otpInput.current?.focus(), 50);
      listenForSms();
    } catch (e) {
      setError(fbMessage(e));
      verifier.current?.clear(); verifier.current = null;
    }
    setBusy(false);
  }

  /** Android Chrome: read the OTP straight from the SMS when the message allows it (Web OTP API). */
  function listenForSms() {
    if (!("OTPCredential" in window)) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setAutoReading(true);
    (navigator.credentials.get({ otp: { transport: ["sms"] }, signal: ac.signal } as CredentialRequestOptions) as Promise<(Credential & { code?: string }) | null>)
      .then((cred) => { if (cred?.code) { setOtp(cred.code.slice(0, 6)); void verify(cred.code.slice(0, 6)); } })
      .catch(() => {})
      .finally(() => setAutoReading(false));
    setTimeout(() => { ac.abort(); setAutoReading(false); }, 60_000);
  }

  async function verify(code = otp) {
    if (!/^\d{6}$/.test(code) || !confirmation.current || busy) return;
    setBusy(true); setError("");
    try {
      const cred = await confirmation.current.confirm(code);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/auth/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken, redirect: redirectTo }) })
        .then((r) => r.json()).catch(() => null);
      window.firebase?.auth().signOut().catch(() => {}); // our own session cookie takes over from here
      if (!res?.success) { setError(res?.message || "Couldn't log you in. Please try again."); setBusy(false); return; }
      abort.current?.abort();
      router.push(res.redirect || "/account");
      router.refresh();
      return;
    } catch (e) {
      setError(fbMessage(e));
      setOtp("");
      otpInput.current?.focus();
    }
    setBusy(false);
  }

  async function passwordLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) { setError("Please enter a valid 10-digit mobile number."); return; }
    setBusy(true); setError("");
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: full, password, redirect: redirectTo }) })
      .then((r) => r.json()).catch(() => null);
    if (!res?.success) { setError(res?.message || "Login failed."); setBusy(false); return; }
    router.push(res.redirect || "/");
    router.refresh();
  }

  const phoneField = (
    <Field label="Mobile Number">
      <div className="flex">
        <span className="grid h-12 place-items-center rounded-l-[4px] border border-r-0 border-[#cfcedc] bg-[#f5f5f8] px-3.5 text-[16px] font-medium text-[#353543]">{countryCode}</span>
        <input type="tel" inputMode="numeric" autoComplete="tel-national" autoFocus maxLength={10} value={phone} placeholder="Enter mobile number"
          onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 12)); setError(""); }}
          className={cn(inputCls, "h-12 rounded-l-none text-[16px] tracking-wider")} />
      </div>
    </Field>
  );

  if (mode === "staff") {
    return (
      <AuthCard heading="Email login" sub="For customers who signed up with an email and password.">
        <LoginForm bare redirectTo={redirectTo} storeName={storeName} />
        <button type="button" onClick={() => { setMode("phone"); setError(""); }} className={cn(btnOutline, "mt-3 h-12 w-full")}><Smartphone className="h-5 w-5" />Login with mobile number</button>
      </AuthCard>
    );
  }

  return (
    <AuthCard heading={mode === "otp" ? "Verify your number" : "Login or Sign up"} sub={`Shop at ${storeName} — track orders, save addresses and checkout faster.`}>
      <div ref={captchaBox} />
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}

      {mode === "phone" && (
        <form onSubmit={(e) => { e.preventDefault(); void sendOtp(); }} className="space-y-4">
          <h1 className="text-[20px] font-semibold">Enter your mobile number</h1>
          {phoneField}
          <button type="submit" disabled={busy || !valid} className={cn(btnPrimary, "h-12 w-full")}>
            {busy ? <><Loader2 className="h-5 w-5 animate-spin" />Sending OTP…</> : <><MessageSquareText className="h-5 w-5" />Continue</>}
          </button>
          <p className="text-center text-[12px] text-[#8b8ba3]">We&rsquo;ll send a 6-digit OTP by SMS. New here? Your account is created after verification.</p>
        </form>
      )}

      {mode === "otp" && (
        <div>
          <h1 className="text-[20px] font-semibold">Enter OTP</h1>
          <p className="mt-1 text-[14px] leading-5 text-[#616173]">
            We&rsquo;ve sent a verification code to <b className="font-semibold text-[#353543]">{countryCode} {phone.slice(0, 5)} {phone.slice(5)}</b>{" "}
            <button type="button" onClick={() => { abort.current?.abort(); setMode("phone"); setError(""); }} className="inline-flex items-center gap-0.5 font-semibold text-[var(--hp-accent)]"><Pencil className="h-3.5 w-3.5" />Edit</button>
          </p>
          {/* One real input (so SMS autofill and paste work) drawn as six boxes. */}
          <div className="relative mt-6" onClick={() => otpInput.current?.focus()}>
            <div className="grid grid-cols-6 gap-2.5" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => {
                const active = i === Math.min(otp.length, 5);
                return (
                  <span key={i} className={cn("grid h-[52px] place-items-center rounded-[6px] border text-[22px] font-semibold transition",
                    otp[i] ? "border-[var(--hp-accent)] bg-[color-mix(in_srgb,var(--hp-accent)_5%,white)]" : active ? "border-[var(--hp-accent)] ring-2 ring-[color-mix(in_srgb,var(--hp-accent)_18%,transparent)]" : "border-[#cfcedc]")}>
                    {otp[i] ?? ""}
                  </span>
                );
              })}
            </div>
            <input ref={otpInput} value={otp} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="OTP"
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setOtp(v); setError(""); if (v.length === 6) void verify(v); }}
              className="absolute inset-0 h-full w-full cursor-text opacity-0" />
          </div>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[#8b8ba3]">
            {autoReading && <><Loader2 className="h-4 w-4 animate-spin text-[var(--hp-accent)]" /><span className="flex-1">Trying to auto-read OTP…</span></>}
            {!autoReading && <span className="flex-1">Didn&rsquo;t get it?</span>}
            {left > 0
              ? <span className="font-medium tabular-nums text-[#353543]">Resend in 00:{String(left).padStart(2, "0")}</span>
              : <button type="button" onClick={() => void sendOtp()} disabled={busy} className="font-bold uppercase text-[var(--hp-accent)]">Resend OTP</button>}
          </div>
          <button type="button" onClick={() => void verify()} disabled={busy || otp.length !== 6} className={cn(btnPrimary, "mt-5 h-12 w-full")}>
            {busy ? <><Loader2 className="h-5 w-5 animate-spin" />Verifying…</> : <><ShieldCheck className="h-5 w-5" />Verify &amp; Continue</>}
          </button>
        </div>
      )}

      {mode === "password" && (
        <form onSubmit={passwordLoginSubmit} className="space-y-4">
          <h1 className="text-[20px] font-semibold">Login with password</h1>
          {phoneField}
          <Field label="Password"><PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" /></Field>
          <button type="submit" disabled={busy} className={cn(btnPrimary, "h-12 w-full")}>{busy ? <><Loader2 className="h-5 w-5 animate-spin" />Logging in…</> : "Login"}</button>
          <p className="text-center text-[12.5px] text-[#8b8ba3]">Forgot password? Log in with OTP and set a new one in your profile.</p>
        </form>
      )}

      <div className="my-5 flex items-center gap-3 text-[12px] text-[#8b8ba3]"><span className="h-px flex-1 bg-[#eaeaf2]" />or<span className="h-px flex-1 bg-[#eaeaf2]" /></div>
      <div className="space-y-2.5">
        {mode !== "phone" && mode !== "otp" && (
          <button type="button" onClick={() => { setMode("phone"); setError(""); }} className={cn(btnOutline, "h-11 w-full")}><MessageSquareText className="h-5 w-5" />Login with OTP</button>
        )}
        {passwordLogin && mode !== "password" && (
          <button type="button" onClick={() => { abort.current?.abort(); setMode("password"); setError(""); }} className={cn(btnOutline, "h-11 w-full")}><KeyRound className="h-5 w-5" />Login with password instead</button>
        )}
        <button type="button" onClick={() => { abort.current?.abort(); setMode("staff"); setError(""); }} className="w-full py-1 text-center text-[13px] font-medium text-[#616173] underline-offset-2 hover:underline">
          Login with email &amp; password
        </button>
        <a href="/staff/login" className="block py-1 text-center text-[12.5px] text-[#8b8ba3]">Store staff? <span className="font-semibold text-[var(--hp-accent)]">Staff login →</span></a>
      </div>
      <p className="mt-5 text-center text-[11px] leading-4 text-[#a7a9b6]">This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply.</p>
    </AuthCard>
  );
}
