import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { StaffProfile } from "@/components/staff/StaffProfile";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

/** Every staff member's own profile — only their own details, photo and password. */
export default async function MyProfilePage() {
  const session = await getAdminSession();
  if (!session) redirect("/staff/login");
  const u = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!u) redirect("/staff/login");

  return (
    <AdminShell siteName="EduMint24" pageTitle="My Profile" pageSubtitle="Your details, photo and password"
      username={session.username} role={session.role} permissions={session.permissions}>
      <StaffProfile me={{ username: u.username, email: u.email, firstName: u.firstName ?? "", lastName: u.lastName ?? "", phone: u.phone ?? "", avatar: u.avatar ?? "", role: u.role, since: u.createdAt.toISOString() }} />
    </AdminShell>
  );
}
