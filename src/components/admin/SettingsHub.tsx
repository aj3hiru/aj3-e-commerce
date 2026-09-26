"use client";

import {
  Barcode, Building2, Contact, CreditCard, FileSpreadsheet, FileText, Image as ImageIcon, Keyboard, Percent, Share2, Smartphone, Truck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SettingsMenuLayout, type SettingsMenuItem } from "./SettingsMenuLayout";
import { hiddenBsSections } from "./business-settings-display";

type Perms = Record<string, Record<string, boolean>>;

/** Sections of the Business Settings form itself (switch without leaving the page). */
const FORM_SECTIONS: SettingsMenuItem[] = [
  { key: "identity", label: "Business Identity", icon: Building2 },
  { key: "contact", label: "Contact Information", icon: Contact },
  { key: "branding", label: "Logo & Branding", icon: ImageIcon },
  { key: "social", label: "Social Media", icon: Share2 },
  { key: "tax", label: "Tax & Legal", icon: FileSpreadsheet },
  { key: "invoice", label: "Invoice Settings", icon: FileText },
  { key: "pos", label: "POS Shortcuts", icon: Keyboard },
  { key: "orders", label: "Barcode & Orders", icon: Barcode },
];

/** Settings that are pages of their own, listed in the same menu. */
const PAGE_SECTIONS: (SettingsMenuItem & { perm: [string, string] })[] = [
  { key: "payment", label: "Payment Methods", icon: CreditCard, href: "/admin/ecommerce/payment-settings", perm: ["ecommerce", "manage_payment"] },
  { key: "delivery", label: "Delivery Charge", icon: Truck, href: "/admin/ecommerce/delivery-settings", perm: ["ecommerce", "manage_payment"] },
  { key: "gst", label: "GST / Tax Rates", icon: Percent, href: "/admin/ecommerce/tax-settings", perm: ["ecommerce", "manage_products"] },
  { key: "login", label: "Login & OTP", icon: Smartphone, href: "/admin/ecommerce/login-settings", perm: ["ecommerce", "manage_payment"] },
];

const can = (p: Perms, [g, k]: [string, string]) => !!p[g]?.[k];

/** The Business Settings menu. On the form itself its own sections switch in place; elsewhere they link back to it. */
export function settingsMenu(permissions: Perms, onForm: boolean, hidden: Set<string> = new Set()): SettingsMenuItem[] {
  const form = can(permissions, ["ecommerce", "manage_payment"])
    ? FORM_SECTIONS.map((s) => (onForm ? s : { ...s, href: `/admin/ecommerce/business-settings?section=${s.key}` }))
    : [];
  return [...form, ...PAGE_SECTIONS.filter((s) => can(permissions, s.perm)).map((s): SettingsMenuItem => ({ key: s.key, label: s.label, icon: s.icon, href: s.href }))]
    .filter((s) => !hidden.has(s.key));
}

export const FORM_SECTION_KEYS = FORM_SECTIONS.map((s) => s.key);

/** Payment Methods, GST / Tax Rates and Login & OTP pages, inside the Business Settings menu. */
export function SettingsHub({ active, permissions, children }: { active: string; permissions: Perms; children: React.ReactNode }) {
  // Business Settings → Display Options can hide menu sections; the current page always stays listed.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => { const h = hiddenBsSections(); h.delete(active); setHidden(h); }, [active]);
  return <SettingsMenuLayout items={settingsMenu(permissions, false, hidden)} active={active}>{children}</SettingsMenuLayout>;
}
