"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/shop/ui/PasswordInput";
import { Field, Notice, btnPrimary, inputCls } from "@/components/shop/ui/Meesho";

/** Username, mobile or email + password (no OTP). */
export function StaffLoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/auth/staff-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity, password, remember }) })
      .then((r) => r.json()).catch(() => null);
    if (!res?.success) { setError(res?.message || "Couldn't log in. Check your connection."); setBusy(false); return; }
    const safe = next && next.startsWith("/") && !next.startsWith("//") && (next.startsWith("/admin") || next.startsWith("/agent") || next.startsWith("/push-notifications")) ? next : null;
    router.push(safe && res.redirect !== "/agent" ? safe : res.redirect);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Username, mobile or email">
        <input required autoFocus autoComplete="username" value={identity} onChange={(e) => { setIdentity(e.target.value); setError(""); }}
          className={cn(inputCls, "h-11")} />
      </Field>
      <Field label="Password">
        <PasswordInput required autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} className="h-11 pl-3" plain />
      </Field>
      <label className="flex w-fit cursor-pointer select-none items-center gap-2 text-[13.5px] text-[#616173]">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="peer sr-only" />
        <span className="grid h-[18px] w-[18px] place-items-center rounded-[3px] border border-[#cfcedc] bg-white text-white transition peer-checked:border-[var(--hp-accent)] peer-checked:bg-[var(--hp-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_srgb,var(--hp-accent)_25%,transparent)]">
          <Check className={cn("h-3.5 w-3.5 transition", remember ? "opacity-100" : "opacity-0")} strokeWidth={3} />
        </span>
        Remember me
      </label>
      <button type="submit" disabled={busy} className={cn(btnPrimary, "h-11 w-full font-semibold")}>
        {busy ? <><Loader2 className="h-5 w-5 animate-spin" />Logging in…</> : "Log In"}
      </button>
    </form>
  );
}
