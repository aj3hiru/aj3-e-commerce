"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/shop/ui/PasswordInput";
import { Field, Notice, btnPrimary, inputCls } from "@/components/shop/ui/Meesho";

/** Staff login: username, mobile or email + password (no OTP). */
export function StaffLoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/auth/staff-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity, password }) })
      .then((r) => r.json()).catch(() => null);
    if (!res?.success) { setError(res?.message || "Couldn't log in. Check your connection."); setBusy(false); return; }
    const safe = next && next.startsWith("/") && !next.startsWith("//") && (next.startsWith("/admin") || next.startsWith("/agent") || next.startsWith("/push-notifications")) ? next : null;
    router.push(safe && res.redirect !== "/agent" ? safe : res.redirect);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Username, mobile number or email">
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#a7a9b6]" strokeWidth={1.8} />
          <input required autoFocus autoComplete="username" value={identity} onChange={(e) => { setIdentity(e.target.value); setError(""); }}
            placeholder="e.g. ravi or 9876543210" className={cn(inputCls, "h-12 pl-10")} />
        </div>
      </Field>
      <Field label="Password">
        <PasswordInput required autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="Your password" />
      </Field>
      <button type="submit" disabled={busy} className={cn(btnPrimary, "h-12 w-full")}>
        {busy ? <><Loader2 className="h-5 w-5 animate-spin" />Logging in…</> : <><ShieldCheck className="h-5 w-5" />Login</>}
      </button>
      <p className="text-center text-[12.5px] text-[#8b8ba3]">Forgot your password? Ask your store admin to set a new one.</p>
    </form>
  );
}
