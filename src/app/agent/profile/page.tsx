import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { StaffProfile } from "@/components/staff/StaffProfile";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/** The agent's own profile: photo, details, password, logout. */
export default async function AgentProfilePage() {
  const session = (await getAdminSession())!;
  const u = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!u) redirect("/staff/login");
  return (
    <div className="space-y-3 px-3 pb-4 pt-3">
      <StaffProfile me={{ username: u.username, email: u.email, firstName: u.firstName ?? "", lastName: u.lastName ?? "", phone: u.phone ?? "", avatar: u.avatar ?? "", role: u.role, since: u.createdAt.toISOString() }} />
      <form action="/api/auth/logout" method="POST" className="mx-auto max-w-[640px]">
        <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-semibold text-[#d0263a] shadow-sm ring-1 ring-[#eaeaf2]"><LogOut className="h-5 w-5" />Logout</button>
      </form>
    </div>
  );
}
