import { AgentToday } from "@/components/agent/AgentToday";
import { getAdminSession } from "@/lib/admin-auth";
import { agentToday } from "@/lib/agent-data";
import { prisma } from "@/lib/db";
import { staffName } from "@/lib/staff";

export const dynamic = "force-dynamic";

/** Today: progress, cash, and every order to deliver / delivered / cancelled today. */
export default async function AgentHome() {
  const session = (await getAdminSession())!;
  const [d, u] = await Promise.all([agentToday(session.userId), prisma.user.findUnique({ where: { id: session.userId }, select: { username: true, firstName: true, lastName: true } })]);
  return <AgentToday name={u ? staffName(u) : session.username} active={d.active} delivered={d.delivered} cancelled={d.cancelled} stats={d.stats} />;
}
