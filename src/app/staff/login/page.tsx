import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { StaffLoginForm } from "@/components/staff/StaffLoginForm";
import { getAdminSession } from "@/lib/admin-auth";
import { staffHome } from "@/lib/staff";
import { prisma } from "@/lib/db";
import { getLiveHome } from "@/lib/home-config";

export const metadata: Metadata = { title: "Log In", robots: { index: false, follow: false } };

/** Staff panel login — one minimal card: the store's logo, the two fields, Log In. */
export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getAdminSession();
  if (session) redirect(staffHome(session.role, session.permissions));
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0];
  const storeUrl = host.startsWith("login.") ? `https://${host.slice(6)}/shop` : "/shop";
  const [{ next }, biz, home] = await Promise.all([searchParams, prisma.ecomBusinessSettings.findFirst({ orderBy: { id: "asc" }, select: { businessName: true, logo: true } }), getLiveHome()]);
  const store = biz?.businessName ?? "Our Store";

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f3f3f7] px-4 py-10 font-storefront text-[#353543]" style={{ ["--hp-accent" as string]: home.accent }}>
      <div className="w-full max-w-[360px]">
        <div className="overflow-hidden rounded-[8px] border border-[#e4e4ee] bg-white shadow-[0_1px_2px_rgba(53,53,67,0.04),0_12px_32px_-12px_rgba(53,53,67,0.18)]">
          <div className="h-[3px] bg-[var(--hp-accent)]" />
          <div className="px-6 pb-7 pt-7">
            <div className="mb-6 flex h-12 items-center justify-center overflow-hidden">
              {biz?.logo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/${biz.logo}`} alt={store} className="max-h-12 max-w-[200px] object-contain" />
                : <span className="truncate text-[22px] font-extrabold tracking-tight text-[var(--hp-accent)]">{store}</span>}
            </div>
            <StaffLoginForm next={next} />
          </div>
        </div>
        <a href={storeUrl} className="mx-auto mt-6 flex w-fit items-center gap-1.5 text-[13px] text-[#8b8ba3] transition hover:text-[var(--hp-accent)]">
          <ArrowLeft className="h-3.5 w-3.5" />Back to {store}
        </a>
      </div>
    </main>
  );
}
