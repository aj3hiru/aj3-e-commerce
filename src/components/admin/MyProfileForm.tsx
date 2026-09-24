"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";

interface MyProfileFormProps {
  username: string;
  email: string;
  role: string;
}

function MyProfileForm({ username: initialUsername, email: initialEmail, role }: MyProfileFormProps) {
  const [username, setUsername] = useState(initialUsername);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, confirmPassword, currentPassword }),
      });
      const data = await res.json();
      setNotice({ type: data.success ? "success" : "error", message: data.message });
      if (data.success) {
        setPassword("");
        setConfirmPassword("");
        setCurrentPassword("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-lg border border-admin-gray-200 p-6">
        <div className="text-center mb-6">
          <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-admin-primary to-admin-primary-dark text-white flex items-center justify-center font-bold text-2xl mx-auto mb-3">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="font-bold text-lg">{username}</div>
          <div className="text-sm text-admin-gray-500 capitalize">{role}</div>
        </div>

        {notice && (
          <div className={`text-sm rounded px-4 py-2.5 mb-4 ${notice.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {notice.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Username *</label>
            <input required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email *</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <hr className="border-admin-gray-100" />
          <p className="text-xs text-admin-gray-500">Leave the password fields blank to keep your current password.</p>
          <div>
            <label className="block text-xs font-medium mb-1">Current Password</label>
            <input type="password" autoComplete="current-password" required={password !== ""} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">New Password</label>
            <input type="password" autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Confirm New Password</label>
            <input type="password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-admin-primary hover:bg-admin-primary-dark text-white font-semibold rounded-lg py-2.5 disabled:opacity-60">
            <Save className="w-4 h-4" /> {submitting ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

export { MyProfileForm };
