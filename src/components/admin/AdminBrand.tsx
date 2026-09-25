"use client";

import { createContext, useContext } from "react";
import { logoSrc } from "@/types/invoice-settings";

export interface AdminBrandInfo { name: string; logo: string | null }

const BrandContext = createContext<AdminBrandInfo | null>(null);

/** The store's name and logo from Business Settings, for the admin sidebar / header. */
export function AdminBrandProvider({ brand, children }: { brand: AdminBrandInfo; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useAdminBrand(fallbackName: string): AdminBrandInfo {
  return useContext(BrandContext) ?? { name: fallbackName, logo: null };
}

/** The logo when one is uploaded, otherwise the site title. */
export function AdminBrandMark({ fallbackName, className }: { fallbackName: string; className?: string }) {
  const { name, logo } = useAdminBrand(fallbackName);
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoSrc(logo)} alt={name} className="block max-h-10 w-auto max-w-[170px] object-contain" />;
  }
  return <span className={className ?? "block truncate text-[1.15rem] font-extrabold text-[#7c3aed]"}>{name}</span>;
}
