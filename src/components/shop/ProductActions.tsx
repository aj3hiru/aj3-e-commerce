"use client";

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Heart, Star } from "lucide-react";
import { useAddToCart } from "@/hooks/useAddToCart";
import { cn } from "@/lib/utils";

interface ProductActionsProps {
  productId: number;
  outOfStock: boolean;
  isWished: boolean;
  isLoggedIn: boolean;
}

/** Verified against product.php's stepQty()/addToCart()/toggleWishlist() script. */
export function ProductActions({ productId, outOfStock, isWished: initialWished, isLoggedIn }: ProductActionsProps) {
  const { addToCart, adding } = useAddToCart();
  const [qty, setQty] = useState(1);
  const [wished, setWished] = useState(initialWished);
  const [wishBusy, setWishBusy] = useState(false);

  async function toggleWishlist() {
    if (!isLoggedIn) {
      window.location.href = "/shop/login";
      return;
    }
    setWishBusy(true);
    try {
      const res = await fetch("/api/shop/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      const data = await res.json();
      if (data.success) setWished(data.wishlisted);
      else if (data.need_login) window.location.href = "/shop/login";
    } finally {
      setWishBusy(false);
    }
  }

  return (
    <div className="flex gap-2 mt-3">
      {!outOfStock ? (
        <>
          <div className="flex items-center border border-storefront-border rounded overflow-hidden">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-10 flex items-center justify-center hover:bg-storefront-bg">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-12 text-center outline-none"
            />
            <button onClick={() => setQty((q) => q + 1)} className="w-9 h-10 flex items-center justify-center hover:bg-storefront-bg">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => addToCart(productId, qty)}
            disabled={adding}
            className="flex items-center gap-2 bg-storefront-green hover:bg-storefront-green-dark text-white font-semibold rounded px-5 py-2.5 disabled:opacity-60"
          >
            <ShoppingCart className="w-4 h-4" /> Add to Cart
          </button>
        </>
      ) : (
        <button disabled className="bg-storefront-muted text-white font-semibold rounded px-5 py-2.5">Out of Stock</button>
      )}
      <button
        onClick={toggleWishlist}
        disabled={wishBusy}
        className="w-11 h-11 flex items-center justify-center border border-storefront-green rounded text-storefront-green"
      >
        <Heart className={cn("w-4 h-4", wished && "fill-storefront-green")} />
      </button>
    </div>
  );
}

interface ReviewFormProps {
  productId: number;
  isLoggedIn: boolean;
}

/** Verified against the "Write a Review" form in product.php. */
export function ReviewForm({ productId, isLoggedIn }: ReviewFormProps) {
  const [rating, setRating] = useState("5");
  const [reviewText, setReviewText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoggedIn) {
    return (
      <p className="mt-3 text-sm">
        <Link href="/shop/login" className="text-storefront-green font-medium">Login</Link> to write a review.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/shop/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating: Number(rating), reviewText }),
      });
      const data = await res.json();
      setNotice(data.message);
      if (data.success) setReviewText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 max-w-md">
      <h6 className="font-bold mb-2 text-sm">Write a Review</h6>
      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-3 py-2 mb-2">{notice}</div>}
      <select value={rating} onChange={(e) => setRating(e.target.value)} className="w-full border border-storefront-border rounded px-3 py-2 text-sm mb-2">
        <option value="5">★★★★★ Excellent</option>
        <option value="4">★★★★ Good</option>
        <option value="3">★★★ Average</option>
        <option value="2">★★ Poor</option>
        <option value="1">★ Terrible</option>
      </select>
      <textarea
        value={reviewText}
        onChange={(e) => setReviewText(e.target.value)}
        rows={3}
        placeholder="Share your experience…"
        className="w-full border border-storefront-border rounded px-3 py-2 text-sm mb-2"
      />
      <button type="submit" disabled={submitting} className="bg-storefront-green hover:bg-storefront-green-dark text-white text-sm font-semibold rounded px-4 py-2 disabled:opacity-60">
        {submitting ? "Submitting…" : "Submit Review"}
      </button>
    </form>
  );
}

export function StarRating({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  return (
    <div className="flex text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn(size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4", i < Math.round(value) ? "fill-amber-400" : "text-storefront-border")} />
      ))}
    </div>
  );
}
