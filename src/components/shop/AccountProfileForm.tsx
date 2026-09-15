"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AccountProfileFormProps {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export function AccountProfileForm({ name: initialName, email, phone: initialPhone, address: initialAddress }: AccountProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [address, setAddress] = useState(initialAddress);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/shop/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, address }),
      });
      const data = await res.json();
      setNotice(data.message);
      if (data.success) router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-storefront-border p-5">
      <h5 className="font-bold mb-3">Profile</h5>
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-3 py-2 mb-3">{notice}</div>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">Name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-storefront-border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Email</label>
          <input type="email" value={email} disabled className="w-full border border-storefront-border rounded px-3 py-2 text-sm bg-storefront-bg text-storefront-muted" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-storefront-border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Address</label>
          <textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} className="w-full border border-storefront-border rounded px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={submitting} className="w-full bg-storefront-green hover:bg-storefront-green-dark text-white font-semibold rounded py-2.5 disabled:opacity-60">
          {submitting ? "Saving…" : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
