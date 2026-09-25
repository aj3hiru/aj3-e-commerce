"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, KeyRound, Loader2, Mail, Phone, Save, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { roleLabel, STAFF_ROLES } from "@/lib/roles";
import { PasswordInput } from "@/components/shop/ui/PasswordInput";
import { Field, Notice, btnPrimary, inputCls } from "@/components/shop/ui/Meesho";
import { AvatarPicker } from "./AvatarPicker";
import { useOptionalWidgetVisible } from "@/hooks/useDashboardWidgetPrefs";

export interface StaffProfileData { username: string; email: string; firstName: string; lastName: string; phone: string; avatar: string; role: string; since: string }

const icon = (I: typeof Mail, input: React.ReactNode) => (
  <div className="relative"><I className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#a7a9b6]" strokeWidth={1.8} />{input}</div>
);

/** A staff member's own profile: photo, details and password (Meesho style). */
export function StaffProfile({ me }: { me: StaffProfileData }) {
  const show = useOptionalWidgetVisible();
  const router = useRouter();
  const [f, setF] = useState(me);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState<"details" | "password" | null>(null);
  const [msg, setMsg] = useState<{ where: "details" | "password"; ok: boolean; text: string } | null>(null);
  const set = (p: Partial<StaffProfileData>) => setF((x) => ({ ...x, ...p }));
  const color = STAFF_ROLES.find((r) => r.id === me.role)?.color ?? "#64748b";

  async function save(where: "details" | "password", extra: Record<string, string> = {}) {
    setBusy(where); setMsg(null);
    const res = await fetch("/api/users/me", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: f.username, email: f.email, firstName: f.firstName, lastName: f.lastName, phone: f.phone, avatar: f.avatar, ...extra }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(null);
    setMsg({ where, ok: !!res?.success, text: res?.success ? (where === "password" ? "Password changed." : "Profile saved.") : res?.message || "Couldn't save." });
    if (res?.success) { if (where === "password") setPw({ current: "", next: "", confirm: "" }); router.refresh(); }
  }

  return (
    <div className="mx-auto max-w-[640px] space-y-3 font-storefront text-[#353543]" style={{ ["--hp-accent" as string]: "#9f2089" }}>
      {show("mp-sections") && show("mp-card") && (
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#eaeaf2]">
          <div className="h-20" style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--hp-accent,#9f2089) 85%, black), var(--hp-accent,#9f2089))" }} />
          <div className="-mt-12 flex flex-col items-center px-5 pb-5 text-center">
            <AvatarPicker value={f.avatar} name={f.firstName || f.username} onChange={(avatar) => { set({ avatar }); }} />
            <p className="mt-2 text-[20px] font-bold">{[f.firstName, f.lastName].filter(Boolean).join(" ") || f.username}</p>
            <span className="mt-1 rounded-full px-3 py-0.5 text-[12px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 11%, white)` }}>{roleLabel(me.role)}</span>
            <p className="mt-1.5 text-[12px] text-[#8b8ba3]">Member since {new Date(me.since).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
          </div>
        </section>
      )}

      {show("mp-sections") && show("mp-details") && (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#eaeaf2]">
          <h2 className="mb-4 flex items-center gap-2 text-[16px] font-semibold"><UserRound className="h-5 w-5 text-[var(--hp-accent,#9f2089)]" />Personal details</h2>
          {msg?.where === "details" && <div className="mb-3"><Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice></div>}
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="First name"><input value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} className={cn(inputCls, "h-11")} /></Field>
            <Field label="Last name"><input value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} className={cn(inputCls, "h-11")} /></Field>
            <Field label="Mobile number" hint="You can log in with it">{icon(Phone, <input inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile" className={cn(inputCls, "h-11 pl-10")} />)}</Field>
            <Field label="Email">{icon(Mail, <input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} className={cn(inputCls, "h-11 pl-10")} />)}</Field>
            <Field label="Username">{icon(AtSign, <input value={f.username} onChange={(e) => set({ username: e.target.value.trim() })} className={cn(inputCls, "h-11 pl-10")} />)}</Field>
          </div>
          <button type="button" disabled={busy !== null} onClick={() => save("details")} className={cn(btnPrimary, "mt-4 w-full sm:w-auto")}>
            {busy === "details" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}Save details
          </button>
        </section>
      )}

      {show("mp-sections") && show("mp-password") && (
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#eaeaf2]">
          <h2 className="mb-4 flex items-center gap-2 text-[16px] font-semibold"><KeyRound className="h-5 w-5 text-[var(--hp-accent,#9f2089)]" />Change password</h2>
          {msg?.where === "password" && <div className="mb-3"><Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice></div>}
          <div className="space-y-3.5">
            <Field label="Current password"><PasswordInput autoComplete="current-password" value={pw.current} onChange={(e) => setPw((x) => ({ ...x, current: e.target.value }))} /></Field>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="New password" hint="Min 6 characters"><PasswordInput autoComplete="new-password" value={pw.next} onChange={(e) => setPw((x) => ({ ...x, next: e.target.value }))} /></Field>
              <Field label="Confirm new password"><PasswordInput autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((x) => ({ ...x, confirm: e.target.value }))} /></Field>
            </div>
          </div>
          <button type="button" disabled={busy !== null || !pw.current || pw.next.length < 6 || pw.next !== pw.confirm}
            onClick={() => save("password", { currentPassword: pw.current, password: pw.next, confirmPassword: pw.confirm })} className={cn(btnPrimary, "mt-4 w-full sm:w-auto")}>
            {busy === "password" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}Update password
          </button>
          {pw.next && pw.confirm && pw.next !== pw.confirm && <p className="mt-2 text-[12.5px] text-red-600">The new passwords don&rsquo;t match.</p>}
        </section>
      )}
    </div>
  );
}
