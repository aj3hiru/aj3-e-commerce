/** A campaign or coupon that Push → "Offer" can promote. */
export interface OfferHit {
  key: string;
  type: "campaign" | "coupon";
  id: number;
  name: string;
  offer: string; // "20% OFF"
  appliesTo: string;
  href: string; // store path
  image: string | null;
  code: string | null; // coupons only
  endsAt: string | null;
  upcoming: boolean;
}
