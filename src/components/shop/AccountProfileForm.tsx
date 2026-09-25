"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ChevronDown, KeyRound, Loader2, UserPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/shop/ui/PasswordInput";
import { Field, Notice, btnPrimary, inputCls } from "@/components/shop/ui/Meesho";

async function post(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
}

/** "Edit Profile" — a collapsible section on the account page. */
export function AccountProfileForm({ name: initialName, email: initialEmail, phone: initialPhone, phoneLocked, open: startOpen = false }: {
  name: string; email: string; phone: string; phoneLocked: boolean; open?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setNotice(null);
    const data = await post("/api/shop/account", { name, email, phone });
    setNotice({ ok: !!data?.success, text: data?.message || "Couldn't save." });
    if (data?.success) router.refresh();
    setSubmitting(false);
  }

  return (
    <section id="profile" className="mb-2 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3.5 px-4 py-4 text-left">
        <UserPen className="h-5 w-5 text-[#666]" strokeWidth={1.7} />
        <span className="flex-1 text-[15px] font-medium">Edit Profile</span>
        <ChevronDown className={cn("h-5 w-5 text-[#a7a9b6] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <form onSubmit={handleSubmit} className="space-y-3.5 border-t border-[#eaeaf2] px-4 pb-5 pt-4">
          {notice && <Notice tone={notice.ok ? "success" : "error"}>{notice.text}</Notice>}
          <Field label="Full Name"><input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={cn(inputCls, "h-11")} /></Field>
          <Field label="Mobile Number" hint={phoneLocked ? "Verified — used to log in" : undefined}>
            <div className="relative">
              <input type="tel" inputMode="tel" value={phone} disabled={phoneLocked} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" className={cn(inputCls, "h-11", phoneLocked && "pr-10")} />
              {phoneLocked && <BadgeCheck className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#038d63]" />}
            </div>
          </Field>
          <Field label="Email" hint="Optional"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" className={cn(inputCls, "h-11")} /></Field>
          <button type="submit" disabled={submitting} className={cn(btnPrimary, "w-full")}>{submitting ? <><Loader2 className="h-5 w-5 animate-spin" />Saving…</> : "Save Changes"}</button>
        </form>
      )}
    </section>
  );
}

/** Set a password (for OTP-only accounts) or change it. */
export function PasswordCard({ hasPassword, hasEmail, open: startOpen = false }: { hasPassword: boolean; hasEmail: boolean; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(hasPassword);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { setNotice({ ok: false, text: "The two passwords don't match." }); return; }
    setBusy(true); setNotice(null);
    const res = await post("/api/shop/account/password", { current, password: pw });
    setNotice({ ok: !!res?.success, text: res?.message || "Couldn't save." });
    if (res?.success) { setDone(true); setCurrent(""); setPw(""); setPw2(""); }
    setBusy(false);
  }

  return (
    <section id="security" className="mb-2 bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3.5 px-4 py-4 text-left">
        <KeyRound className="h-5 w-5 text-[#666]" strokeWidth={1.7} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{done ? "Change Password" : "Set Email & Password"}</span>
          {!done && <span className="block text-[12px] text-[#8b8ba3]">Optional — log in without OTP next time</span>}
        </span>
        <ChevronDown className={cn("h-5 w-5 text-[#a7a9b6] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <form onSubmit={submit} className="space-y-3.5 border-t border-[#eaeaf2] px-4 pb-5 pt-4">
          {notice && <Notice tone={notice.ok ? "success" : "error"}>{notice.text}</Notice>}
          {!hasEmail && !done && <p className="text-[13px] text-[#616173]">Tip: add your email in <b>Edit Profile</b> too — then you can log in with email or mobile + password.</p>}
          {done && <Field label="Current Password"><PasswordInput required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>}
          <Field label={done ? "New Password" : "Password"} hint="At least 6 characters"><PasswordInput required minLength={6} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Confirm Password"><PasswordInput required minLength={6} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          <button type="submit" disabled={busy} className={cn(btnPrimary, "w-full")}>{busy ? <><Loader2 className="h-5 w-5 animate-spin" />Saving…</> : done ? "Change Password" : "Set Password"}</button>
        </form>
      )}
    </section>
  );
}

/** First step after signing up with OTP: name (required) and email (optional). */
export function ProfileSetup({ phone, next }: { phone: string; next: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await post("/api/shop/account", { name, email });
    if (!res?.success) { setError(res?.message || "Couldn't save."); setBusy(false); return; }
    router.push(next ?? "/shop/account?setup=done");
    router.refresh();
  }
  return (
    <section className="mb-2 bg-white px-4 pb-6 pt-5">
      <div className="mb-4 flex items-center gap-2 rounded-[6px] bg-[#e7f8ee] px-3 py-2.5 text-[13.5px] font-medium text-[#038d63]"><BadgeCheck className="h-5 w-5" />Mobile number {phone} verified</div>
      <h2 className="text-[20px] font-semibold">Complete your profile</h2>
      <p className="mt-1 text-[13.5px] text-[#8b8ba3]">Tell us your name so we can deliver to you.</p>
      <form onSubmit={submit} className="mt-4 space-y-3.5">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Full Name"><input required autoFocus value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your full name" className={cn(inputCls, "h-12")} /></Field>
        <Field label="Email" hint="Optional"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="For order updates" className={cn(inputCls, "h-12")} /></Field>
        <button type="submit" disabled={busy || !name.trim()} className={cn(btnPrimary, "h-12 w-full")}>{busy ? <><Loader2 className="h-5 w-5 animate-spin" />Saving…</> : "Save & Continue"}</button>
      </form>
    </section>
  );
}
