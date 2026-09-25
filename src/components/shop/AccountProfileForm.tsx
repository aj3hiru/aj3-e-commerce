"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, UserPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, Notice, btnPrimary, inputCls } from "@/components/shop/ui/Meesho";

interface AccountProfileFormProps {
  name: string;
  email: string;
  phone: string;
  address: string;
  /** Start expanded (e.g. when the address is still empty). */
  open?: boolean;
}

/** "Edit Profile" — a collapsible Meesho-style section on the account page. */
export function AccountProfileForm({ name: initialName, email, phone: initialPhone, address: initialAddress, open: startOpen = false }: AccountProfileFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [address, setAddress] = useState(initialAddress);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
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
      setNotice({ ok: !!data.success, text: data.message || (data.success ? "Saved." : "Couldn't save.") });
      if (data.success) router.refresh();
    } catch {
      setNotice({ ok: false, text: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
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
          <Field label="Full Name"><input required value={name} onChange={(e) => setName(e.target.value)} className={cn(inputCls, "h-11")} /></Field>
          <Field label="Email" hint="Can't be changed"><input type="email" value={email} disabled className={cn(inputCls, "h-11")} /></Field>
          <Field label="Phone"><input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" className={cn(inputCls, "h-11")} /></Field>
          <Field label="Delivery Address"><textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House no., street, area, city, pincode" className={cn(inputCls, "py-2.5 leading-6")} /></Field>
          <button type="submit" disabled={submitting} className={cn(btnPrimary, "w-full")}>
            {submitting ? <><Loader2 className="h-5 w-5 animate-spin" />Saving…</> : "Save Changes"}
          </button>
        </form>
      )}
    </section>
  );
}
