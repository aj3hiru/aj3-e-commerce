"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, ClipboardPaste, ExternalLink, KeyRound, Loader2, MessageSquareText, Save, ShieldCheck, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { otpReady, type AuthSettings } from "@/types/auth-settings";

const INPUT = "w-full rounded-md border border-admin-gray-200 bg-white px-3 py-2 font-mono text-sm text-admin-gray-800 placeholder:font-sans placeholder:text-admin-gray-400 focus:border-admin-primary focus:outline-none focus:ring-2 focus:ring-admin-primary/15";

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-admin-primary" : "bg-admin-gray-300")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

/** Pulls the values out of the `firebaseConfig = { ... }` snippet Firebase shows. */
function parseSnippet(text: string): Partial<AuthSettings["firebase"]> {
  const pick = (k: string) => new RegExp(`${k}\\s*:\\s*["']([^"']+)["']`).exec(text)?.[1];
  return { apiKey: pick("apiKey"), authDomain: pick("authDomain"), projectId: pick("projectId"), appId: pick("appId"), messagingSenderId: pick("messagingSenderId") };
}

const STEPS: { title: string; body: React.ReactNode }[] = [
  { title: "Create a Firebase project", body: <>Open <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="font-semibold text-admin-primary underline">console.firebase.google.com</a> → <b>Add project</b> → give it a name (e.g. your store name) → Continue. Google Analytics can be turned off.</> },
  { title: "Add a Web app", body: <>In the project: <b>Project settings (⚙)</b> → <b>Your apps</b> → click the <b>&lt;/&gt; Web</b> icon → any nickname → <b>Register app</b>. Firebase shows a <code className="rounded bg-admin-gray-100 px-1">firebaseConfig</code> code block — copy it and paste it below.</> },
  { title: "Turn on Phone sign-in", body: <><b>Build → Authentication</b> → <b>Get started</b> → <b>Sign-in method</b> tab → <b>Phone</b> → Enable → Save.</> },
  { title: "Allow your website", body: <><b>Authentication → Settings → Authorized domains</b> → <b>Add domain</b> → enter your site&rsquo;s domain (e.g. <code className="rounded bg-admin-gray-100 px-1">sriandaltraders.co.in</code>).</> },
  { title: "Test (free), then go live", body: <>Under <b>Sign-in method → Phone → Phone numbers for testing</b> add a number with a fixed code (e.g. +91 9999999999 → 123456) to test without SMS. For real SMS to customers, Firebase asks you to upgrade the project to the <b>Blaze</b> (pay-as-you-go) plan and charges per SMS sent — check the current SMS price for India on Firebase&rsquo;s pricing page and set a budget alert in Google Cloud.</> },
  { title: "Switch it on here", body: <>Paste the config, turn on <b>Mobile OTP login</b>, and <b>Save</b>. Then open your store&rsquo;s login page and try it.</> },
];

export function LoginSettingsForm({ initial, origin }: { initial: AuthSettings; origin: string }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [paste, setPaste] = useState("");
  const dirty = JSON.stringify(s) !== saved;
  const configured = !!(s.firebase.apiKey && s.firebase.authDomain && s.firebase.projectId && s.firebase.appId);
  const setFb = (p: Partial<AuthSettings["firebase"]>) => setS((x) => ({ ...x, firebase: { ...x.firebase, ...p } }));

  function applyPaste(text: string) {
    setPaste(text);
    const got = parseSnippet(text);
    const clean = Object.fromEntries(Object.entries(got).filter(([, v]) => v)) as Partial<AuthSettings["firebase"]>;
    if (Object.keys(clean).length) { setFb(clean); setMsg({ ok: true, text: `Filled ${Object.keys(clean).length} field(s) from the pasted config.` }); }
  }

  async function save() {
    if (s.otpEnabled && !configured) { setMsg({ ok: false, text: "Fill in the Firebase config (API key, Auth domain, Project ID and App ID) before turning OTP on." }); return; }
    setBusy(true); setMsg(null);
    const res = await fetch("/api/ecommerce/auth-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!res?.success) { setMsg({ ok: false, text: res?.message || "Couldn't save." }); return; }
    setS(res.settings); setSaved(JSON.stringify(res.settings));
    setMsg({ ok: true, text: "Saved — the store's login page uses these settings now." });
  }

  const live = otpReady(JSON.parse(saved) as AuthSettings);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-5">
        <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", live ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
          {live ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <CircleAlert className="h-5 w-5 shrink-0" />}
          <p className="flex-1 text-sm font-medium">{live ? "Mobile OTP login is live on your store." : "Customers log in with email/mobile + password. Set up Firebase to turn on OTP login."}</p>
          <a href={`${origin}/login`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold underline">Open login page<ExternalLink className="h-3.5 w-3.5" /></a>
        </div>

        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-admin-gray-800"><ShieldCheck className="h-5 w-5 text-admin-primary" />Login options</h2>
          <div className="divide-y divide-admin-gray-100">
            <div className="flex items-start gap-4 py-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-admin-gray-500" />
              <div className="flex-1"><p className="text-sm font-semibold text-admin-gray-800">Mobile OTP login &amp; sign-up</p>
                <p className="text-xs text-admin-gray-500">Customers enter their mobile number and verify with an OTP. New numbers get an account and then fill in their name, email and addresses. Sign-up with email is turned off while this is on.</p></div>
              <Switch on={s.otpEnabled} onChange={(v) => setS((x) => ({ ...x, otpEnabled: v }))} label="Mobile OTP login" />
            </div>
            <div className="flex items-start gap-4 py-3">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-admin-gray-500" />
              <div className="flex-1"><p className="text-sm font-semibold text-admin-gray-800">Allow password login for customers</p>
                <p className="text-xs text-admin-gray-500">Customers who&rsquo;ve set a password can log in with mobile/email + password (shown as &ldquo;Login with password instead&rdquo;). Staff login is never affected.</p></div>
              <Switch on={s.passwordLogin} onChange={(v) => setS((x) => ({ ...x, passwordLogin: v }))} label="Password login" />
            </div>
            <div className="flex items-center gap-4 py-3">
              <MessageSquareText className="h-5 w-5 shrink-0 text-admin-gray-500" />
              <div className="flex-1"><p className="text-sm font-semibold text-admin-gray-800">Country code</p><p className="text-xs text-admin-gray-500">Added in front of the number customers type.</p></div>
              <input value={s.countryCode} onChange={(e) => setS((x) => ({ ...x, countryCode: e.target.value.replace(/[^\d+]/g, "").slice(0, 5) }))} className={cn(INPUT, "w-24 text-center")} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-admin-gray-800">Firebase web config</h2>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", configured ? "bg-emerald-50 text-emerald-700" : "bg-admin-gray-100 text-admin-gray-500")}>{configured ? "Filled" : "Not set"}</span>
          </div>
          <p className="mb-4 text-xs text-admin-gray-500">These values identify your Firebase project; they&rsquo;re public (they go to the browser) — no secret key is needed.</p>
          <label className="mb-4 block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-admin-gray-700"><ClipboardPaste className="h-3.5 w-3.5" />Quick fill: paste the whole firebaseConfig code here</span>
            <textarea rows={3} value={paste} onChange={(e) => applyPaste(e.target.value)} placeholder={'const firebaseConfig = {\n  apiKey: "AIza…", authDomain: "…firebaseapp.com", projectId: "…", appId: "1:…" };'} className={cn(INPUT, "text-xs")} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["apiKey", "API key", "AIzaSy…"], ["authDomain", "Auth domain", "your-project.firebaseapp.com"], ["projectId", "Project ID", "your-project"], ["appId", "App ID", "1:1234567890:web:abc123"], ["messagingSenderId", "Messaging sender ID (optional)", "1234567890"]] as const).map(([k, label, ph]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-xs font-semibold text-admin-gray-700">{label}</span>
                <input value={s.firebase[k]} onChange={(e) => setFb({ [k]: e.target.value.trim() })} placeholder={ph} className={INPUT} />
              </label>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border border-admin-gray-200 bg-white px-5 py-3.5 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
          <span className={cn("text-sm", msg ? (msg.ok ? "text-emerald-600" : "text-red-600") : "text-admin-gray-400")}>{msg?.text ?? (dirty ? "Unsaved changes" : "All changes saved")}</span>
          <button type="button" onClick={save} disabled={busy || !dirty} className="flex items-center gap-2 rounded-lg bg-admin-primary px-6 py-2.5 font-semibold text-white hover:bg-admin-primary-dark disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Settings
          </button>
        </div>
      </div>

      <aside className="h-fit rounded-xl border border-admin-gray-200 bg-white p-5 shadow-sm xl:sticky xl:top-4">
        <h2 className="mb-1 font-semibold text-admin-gray-800">How to set up Firebase OTP</h2>
        <p className="mb-4 text-xs text-admin-gray-500">About 10 minutes, one time.</p>
        <ol className="space-y-4">
          {STEPS.map((st, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-admin-primary text-xs font-bold text-white">{i + 1}</span>
              <div><p className="text-sm font-semibold text-admin-gray-800">{st.title}</p><p className="mt-0.5 text-xs leading-5 text-admin-gray-600">{st.body}</p></div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
