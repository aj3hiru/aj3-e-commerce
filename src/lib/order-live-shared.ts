/** One change to an order, as the live feed sends it (new order, accepted, status, payment, agent). */
export interface LiveEvent {
  id: number; orderId: number; orderNumber: string; type: string; from: string | null; to: string | null;
  actor: string; actorId: number | null; agentId: number | null; customer: string; total: number; orderType: string; at: string;
}
