import { redirect } from "next/navigation";
import { Download, MonitorDown, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSession } from "@/lib/admin-auth";
import { latestRelease } from "@/lib/app-api";

/** Download page for the staff app (Android + Windows) — any signed-in staff member. */
export default async function StaffAppPage() {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  const rel = await latestRelease();
  const card = "rounded-[12px] border border-[#e5e7eb] bg-white p-6 shadow-sm";
  const btn = "inline-flex h-11 items-center gap-2 rounded-[8px] bg-[#7c3aed] px-5 text-[14.5px] font-semibold text-white hover:bg-[#6d28d9]";
  return (
    <AdminShell siteName="EduMint24" pageTitle="Staff App" pageSubtitle="Billing, orders, deliveries and more on your phone and computer — works offline"
      username={session.username} role={session.role} permissions={session.permissions}>
      <div className="grid max-w-5xl gap-5 md:grid-cols-2">
        <section className={card}>
          <Smartphone className="h-9 w-9 text-[#7c3aed]" />
          <h2 className="mt-3 text-[18px] font-bold">Android</h2>
          <p className="mt-1 text-[14px] text-[#6b7280]">For phones and tablets (Android 7 or newer).</p>
          {rel?.android ? <a href={rel.android} className={`${btn} mt-4`}><Download className="h-4 w-4" />Download APK · v{rel.version}</a> : <p className="mt-4 text-[14px] text-[#b45309]">The first build is being prepared.</p>}
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-[13.5px] text-[#4b5563]">
            <li>Open this page on the phone and tap Download.</li>
            <li>Open the downloaded file. If asked, allow “Install unknown apps” for your browser.</li>
            <li>Open <b>Sri Andal Staff</b> and log in with your staff account.</li>
          </ol>
        </section>
        <section className={card}>
          <MonitorDown className="h-9 w-9 text-[#7c3aed]" />
          <h2 className="mt-3 text-[18px] font-bold">Windows</h2>
          <p className="mt-1 text-[14px] text-[#6b7280]">For the billing counter and office computers (Windows 10 / 11, 64-bit).</p>
          {rel?.windows ? <a href={rel.windows} className={`${btn} mt-4`}><Download className="h-4 w-4" />Download installer · v{rel.version}</a> : <p className="mt-4 text-[14px] text-[#b45309]">The first build is being prepared.</p>}
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-[13.5px] text-[#4b5563]">
            <li>Run the downloaded setup. If Windows shows “protected your PC”, click <b>More info → Run anyway</b>.</li>
            <li>Open <b>Sri Andal Staff</b> from the desktop and log in.</li>
            <li>A USB barcode scanner works in Billing straight away.</li>
          </ol>
        </section>
        <section className={`${card} md:col-span-2`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="flex gap-3 text-[14px] text-[#374151]"><WifiOff className="h-5 w-5 shrink-0 text-[#7c3aed]" />Keeps working without internet — bills, deliveries, stock and due payments are saved on the device and sent automatically (never twice) when the connection is back.</p>
            <p className="flex gap-3 text-[14px] text-[#374151]"><ShieldCheck className="h-5 w-5 shrink-0 text-[#7c3aed]" />Everyone sees only what their role allows — the same permissions as this website. The app tells you when a new version is ready.</p>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
