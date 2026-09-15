import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { MyProfileForm } from "@/components/admin/MyProfileForm";
import { getAdminSession } from "@/lib/admin-auth";

export default async function MyProfilePage() {
  const session = await getAdminSession();
  if (!session) redirect("/shop/login");

  return (
    <AdminShell
      siteName="EduMint24"
      pageTitle="My Profile"
      pageSubtitle="Update your account details and password"
      username={session.username}
      role={session.role}
      permissions={session.permissions}
    >
      <MyProfileForm username={session.username} email={session.email} role={session.role} />
    </AdminShell>
  );
}
