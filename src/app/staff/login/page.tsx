import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bike, Receipt, ShieldCheck, Store } from "lucide-react";
import { StaffLoginForm } from "@/components/staff/StaffLoginForm";
import { getAdminSession } from "@/lib/admin-auth";
import { staffHome } from "@/lib/staff";
import { prisma } from "@/lib/db";
import { getLiveHome } from "@/lib/home-config";

export const metadata: Metadata = { title: "Staff Login", robots: { index: false, follow: false } };

/** Staff panel login — admins, managers, delivery agents, cashiers… (customers log in at /shop/login). */
export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getAdminSession();
  if (session) redirect(staffHome(session.role, session.permissions));
  const [{ next }, biz, home] = await Promise.all([searchParams, prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" }, select: { businessName: true, logo: true } }), getLiveHome()]);
  const store = biz?.businessName ?? "Our Store";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 font-storefront text-[#353543]"
      style={{ ["--hp-accent" as string]: home.accent, background: "linear-gradient(160deg, color-mix(in srgb, var(--hp-accent) 12%, white) 0%, #f5f5f8 45%, #e7eeff 100%)" }}>
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center text-center">
          {biz?.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/${biz.logo}`} alt={store} className="mb-3 h-14 w-auto max-w-[180px] object-contain" />
            : <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--hp-accent)] text-white shadow-lg"><Store className="h-7 w-7" /></span>}
          <p className="text-[22px] font-extrabold text-[var(--hp-accent)]">{store}</p>
          <p className="mt-0.5 text-[13px] font-semibold uppercase tracking-[0.18em] text-[#8b8ba3]">Staff Panel</p>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_rgba(53,53,67,0.12)]">
          <div className="flex items-center justify-around border-b border-[#eaeaf2] bg-[#fafafc] px-4 py-3 text-[11.5px] font-medium text-[#616173]">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[var(--hp-accent)]" />Admin</span>
            <span className="flex items-center gap-1.5"><Bike className="h-4 w-4 text-[#16a34a]" />Delivery</span>
            <span className="flex items-center gap-1.5"><Receipt className="h-4 w-4 text-[#ea580c]" />Billing</span>
          </div>
          <div className="px-6 pb-7 pt-6">
            <h1 className="text-[22px] font-bold">Welcome back</h1>
            <p className="mb-5 mt-1 text-[13.5px] text-[#8b8ba3]">Log in to your staff account — no OTP needed.</p>
            <StaffLoginForm next={next} />
          </div>
        </div>
        <p className="mt-5 text-center text-[13px] text-[#8b8ba3]">Shopping? <Link href="/shop/login" className="font-semibold text-[var(--hp-accent)]">Customer login</Link></p>
      </div>
    </main>
  );
}
