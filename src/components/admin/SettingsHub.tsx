"use client";

import {
  Barcode, Building2, Contact, CreditCard, FileSpreadsheet, FileText, Image as ImageIcon, Keyboard, Percent, Share2, Smartphone,
} from "lucide-react";
import { SettingsMenuLayout, type SettingsMenuItem } from "./SettingsMenuLayout";

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
  { key: "gst", label: "GST / Tax Rates", icon: Percent, href: "/admin/ecommerce/tax-settings", perm: ["ecommerce", "manage_products"] },
  { key: "login", label: "Login & OTP", icon: Smartphone, href: "/admin/ecommerce/login-settings", perm: ["ecommerce", "manage_payment"] },
];

const can = (p: Perms, [g, k]: [string, string]) => !!p[g]?.[k];

/** The Business Settings menu. On the form itself its own sections switch in place; elsewhere they link back to it. */
export function settingsMenu(permissions: Perms, onForm: boolean): SettingsMenuItem[] {
  const form = can(permissions, ["ecommerce", "manage_payment"])
    ? FORM_SECTIONS.map((s) => (onForm ? s : { ...s, href: `/admin/ecommerce/business-settings?section=${s.key}` }))
    : [];
  return [...form, ...PAGE_SECTIONS.filter((s) => can(permissions, s.perm)).map((s): SettingsMenuItem => ({ key: s.key, label: s.label, icon: s.icon, href: s.href }))];
}

export const FORM_SECTION_KEYS = FORM_SECTIONS.map((s) => s.key);

/** Payment Methods, GST / Tax Rates and Login & OTP pages, inside the Business Settings menu. */
export function SettingsHub({ active, permissions, children }: { active: string; permissions: Perms; children: React.ReactNode }) {
  return <SettingsMenuLayout items={settingsMenu(permissions, false)} active={active}>{children}</SettingsMenuLayout>;
}
