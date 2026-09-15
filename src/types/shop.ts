export interface ShopBusinessSettings {
  businessName: string;
  logo?: string | null;
  location?: string | null;
  businessHours?: string | null;
  tagline?: string | null;
  email?: string | null;
  address?: string | null;
  returnPolicy?: string | null;
  contactNumbers?: string[];
  socialMedia?: { platform: SocialPlatform; url: string }[];
}

export type SocialPlatform = "facebook" | "instagram" | "youtube" | "x" | "linkedin" | "whatsapp";

export interface ShopCategoryNavItem {
  slug: string;
  name: string;
}

export interface ShopCustomer {
  id: number;
  name: string;
}
