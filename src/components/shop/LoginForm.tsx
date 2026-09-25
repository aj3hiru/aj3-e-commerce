"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthCard } from "@/components/shop/ui/AuthCard";
import { PasswordInput } from "@/components/shop/ui/PasswordInput";
import { Field, Notice, btnOutline, btnPrimary, inputCls } from "@/components/shop/ui/Meesho";

interface LoginFormProps {
  redirectTo?: string;
  storeName?: string;
  /** Just the form (inside the mobile-OTP login screen). */
  bare?: boolean;
}

/** Login — customers and store staff both sign in here (same two fields as shop/login.php). */
export function LoginForm({ redirectTo, storeName = "our store", bare = false }: LoginFormProps) {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity, password, redirect: redirectTo }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Login failed."); return; }
      router.push(data.redirect || "/shop");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const form = (
    <>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email, Mobile or Username">
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#a7a9b6]" strokeWidth={1.8} />
            <input type="text" required autoFocus autoComplete="username" value={identity} onChange={(e) => setIdentity(e.target.value)}
              placeholder="you@example.com" className={cn(inputCls, "h-12 pl-10")} />
          </div>
        </Field>
        <Field label="Password">
          <PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
        </Field>
        <button type="submit" disabled={submitting} className={cn(btnPrimary, "h-12 w-full")}>
          {submitting ? <><Loader2 className="h-5 w-5 animate-spin" />Logging in…</> : "Continue"}
        </button>
      </form>
    </>
  );
  if (bare) return form;

  return (
    <AuthCard heading="Welcome back!" sub="Login to see your orders, wishlist and checkout faster.">
      <h1 className="mb-4 text-[20px] font-semibold">Login</h1>
      {form}
      <div className="my-5 flex items-center gap-3 text-[12px] text-[#8b8ba3]"><span className="h-px flex-1 bg-[#eaeaf2]" />New to {storeName}?<span className="h-px flex-1 bg-[#eaeaf2]" /></div>
      <Link href={`/shop/register${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`} className={cn(btnOutline, "h-12 w-full")}>Create an account</Link>
      <p className="mt-5 text-center text-[11.5px] leading-4 text-[#a7a9b6]">Customers and store staff both sign in here.</p>
    </AuthCard>
  );
}
