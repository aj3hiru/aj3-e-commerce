"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LoginFormProps {
  redirectTo?: string;
}

/** Verified against the <form> in shop/login.php — same two fields (identity,
 *  password), same copy ("customers and store staff both sign in here"). */
export function LoginForm({ redirectTo }: LoginFormProps) {
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
      if (!data.success) {
        setError(data.message || "Login failed.");
        return;
      }
      router.push(data.redirect || "/shop");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[420px] mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h4 className="text-xl font-bold mb-1">Welcome Back</h4>
        <p className="text-storefront-muted mb-4 text-sm">
          Login to your account to continue — customers and store staff both sign in here.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Email or Username</label>
            <input
              type="text"
              required
              autoFocus
              autoComplete="username"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              className="w-full border border-storefront-border rounded px-3 py-2 text-sm focus:outline-none focus:border-storefront-green"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-storefront-border rounded px-3 py-2 text-sm focus:outline-none focus:border-storefront-green"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-storefront-green hover:bg-storefront-green-dark text-white rounded py-2.5 font-semibold text-sm disabled:opacity-60"
          >
            {submitting ? "Logging in…" : "Login"}
          </button>
        </form>

        <p className="text-center mt-4 text-sm">
          New here?{" "}
          <Link href="/shop/register" className="text-storefront-green font-medium">
            Create a customer account
          </Link>
        </p>
      </div>
    </div>
  );
}
