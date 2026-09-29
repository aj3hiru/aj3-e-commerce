/** Browser-safe parts of the coupon activity feed (no database import). */
export interface CouponActivityRow {
  id: number;
  action: "create" | "update" | "delete" | "pause" | "resume";
  description: string;
  byUsername: string | null;
  createdAt: string; // ISO
}

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}
