import { ShopLayout } from "@/components/shop/ShopLayout";

const DEMO_BUSINESS = {
  businessName: "EduMint Mart",
  location: "Patna, Bihar",
  businessHours: "9 AM - 9 PM",
  tagline: "Your everyday store — fresh products and daily essentials, delivered to your doorstep.",
  email: "contact@edumint24.com",
  address: "Patna, Bihar, India",
  contactNumbers: ["+91 98765 43210"],
  socialMedia: [
    { platform: "whatsapp" as const, url: "#" },
    { platform: "instagram" as const, url: "#" },
  ],
};

const DEMO_CATEGORIES = [
  { slug: "snacks", name: "Snacks" },
  { slug: "beverages", name: "Beverages" },
  { slug: "electronics", name: "Electronics" },
];

export default function DemoShopPage() {
  return (
    <ShopLayout
      business={DEMO_BUSINESS}
      categories={DEMO_CATEGORIES}
      customer={null}
      cartCount={2}
      cartTotal={499}
    >
      <h1 className="text-2xl font-bold mb-4">Featured Products</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-storefront-border p-3">
            <div className="aspect-square bg-storefront-green-light rounded mb-2" />
            <div className="text-sm font-medium">Product {i}</div>
            <div className="text-storefront-green font-bold">₹{99 * i}</div>
          </div>
        ))}
      </div>
    </ShopLayout>
  );
}
