import { notFound } from "next/navigation";
import { AgentOrderView } from "@/components/agent/AgentOrderView";
import { getAdminSession } from "@/lib/admin-auth";
import { agentOrder } from "@/lib/agent-data";

export const dynamic = "force-dynamic";

/** One delivery: everything about the order, the live map and the actions. Only for the assigned agent. */
export default async function AgentOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = (await getAdminSession())!;
  const o = await agentOrder(session.userId, Number((await params).id) || 0);
  if (!o) notFound();
  return <AgentOrderView o={o} />;
}
