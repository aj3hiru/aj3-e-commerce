import { AgentHistory, presetRange } from "@/components/agent/AgentHistory";
import { getAdminSession } from "@/lib/admin-auth";
import { agentHistory } from "@/lib/agent-data";

export const dynamic = "force-dynamic";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** History: everything this agent delivered or cancelled, filtered by date (India time). */
export default async function AgentHistoryPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const session = (await getAdminSession())!;
  const sp = await searchParams;
  const custom = sp.from && sp.to && DATE.test(sp.from) && DATE.test(sp.to);
  const preset = custom ? "custom" : sp.range ?? "7d";
  let { from, to } = custom ? { from: sp.from!, to: sp.to! } : presetRange(preset);
  if (from > to) [from, to] = [to, from];
  const data = await agentHistory(session.userId, new Date(`${from}T00:00:00.000+05:30`), new Date(`${to}T23:59:59.999+05:30`));
  return <AgentHistory from={from} to={to} preset={preset} orders={data.orders} totals={data.totals} />;
}
