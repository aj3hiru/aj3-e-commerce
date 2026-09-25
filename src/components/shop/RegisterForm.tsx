"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, Phone, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthCard } from "@/components/shop/ui/AuthCard";
import { PasswordInput } from "@/components/shop/ui/PasswordInput";
import { Field, Notice, btnOutline, btnPrimary, inputCls } from "@/components/shop/ui/Meesho";

const iconInput = (Icon: typeof Mail, input: React.ReactNode) => (
  <div className="relative">
    <Icon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#a7a9b6]" strokeWidth={1.8} />
    {input}
  </div>
);

/** Sign up (same fields as shop/register.php). */
export function RegisterForm({ storeName = "our store" }: { storeName?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Registration failed."); return; }
      router.push(data.redirect || "/shop/account");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard heading={`Join ${storeName}`} sub="Sign up to track orders, save your wishlist and checkout faster.">
      <h1 className="mb-4 text-[20px] font-semibold">Create Account</h1>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full Name">{iconInput(UserRound, <input type="text" required autoComplete="name" value={form.name} onChange={set("name")} placeholder="Your name" className={cn(inputCls, "h-12 pl-10")} />)}</Field>
        <Field label="Email">{iconInput(Mail, <input type="email" required autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" className={cn(inputCls, "h-12 pl-10")} />)}</Field>
        <Field label="Mobile Number" hint="Optional">{iconInput(Phone, <input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} placeholder="10-digit mobile number" className={cn(inputCls, "h-12 pl-10")} />)}</Field>
        <Field label="Password" hint="At least 6 characters">
          <PasswordInput required minLength={6} autoComplete="new-password" value={form.password} onChange={set("password")} placeholder="Create a password" />
        </Field>
        <button type="submit" disabled={submitting} className={cn(btnPrimary, "h-12 w-full")}>
          {submitting ? <><Loader2 className="h-5 w-5 animate-spin" />Creating account…</> : "Create Account"}
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-[12px] text-[#8b8ba3]"><span className="h-px flex-1 bg-[#eaeaf2]" />Already have an account?<span className="h-px flex-1 bg-[#eaeaf2]" /></div>
      <Link href="/shop/login" className={cn(btnOutline, "h-12 w-full")}>Login</Link>
    </AuthCard>
  );
}
