/** Report Builder — shapes shared by the server loader and the page (plain JSON, no Prisma types). */

export type ReportChannel = "all" | "offline" | "online";
export type ReportPreset = "today" | "yesterday" | "this_month" | "prev_month" | "month" | "custom";

export interface ReportFilters {
  preset: ReportPreset;
  from: string; // YYYY-MM-DD (India time)
  to: string;
  channel: ReportChannel;
  userId: number | null;
}

export interface TimelineRow {
  key: string;
  at: string;
  orderId: number;
  orderNumber: string;
  channel: "offline" | "online";
  status: string;
  customer: string;
  phone: string | null;
  product: string;
  sku: string | null;
  category: string | null;
  qty: number;
  unitPrice: number;
  total: number;
  gst: number;
  payment: string;
  /** The order's outstanding due, on its first line only (so it isn't counted twice). */
  due: number | null;
  staff: string | null;
}

export interface ProductSummaryRow { productId: number; name: string; sku: string | null; category: string | null; qty: number; revenue: number; orders: number; lastSoldAt: string }
export interface DailyRow { day: string; orders: number; offline: number; online: number; units: number; sales: number; due: number; collected: number }
export interface CollectionRow { key: string; at: string; receipt: string; customer: string; orderId: number | null; orderNumber: string | null; method: string; amount: number; by: string | null }
export interface DueRow { key: string; at: string; orderId: number; orderNumber: string; customer: string; phone: string | null; amount: number; paid: number; balance: number; promised: string | null; status: string }
export interface AddedProductRow { id: number; at: string; name: string; sku: string | null; category: string | null; price: number; stock: number | null; by: string | null }
export interface AgentRow { userId: number; name: string; assigned: number; delivered: number; pending: number; canceled: number; deliveredValue: number; avgMinutes: number | null }
export interface StaffRow { userId: number; name: string; role: string; posSales: number; posAmount: number; collections: number; collectedAmount: number; delivered: number; productsAdded: number; actions: number }
export interface ActivityRow { key: string; at: string; action: string; description: string }
export interface StaffOption { id: number; name: string; role: string }

export interface ReportData {
  filters: ReportFilters;
  rangeLabel: string;
  generatedAt: string;
  business: { name: string; tagline: string | null; logo: string | null; address: string | null; phones: string[]; email: string | null; gstin: string | null };
  kpis: {
    sales: number; orders: number; units: number; lines: number;
    due: number; dueOrders: number; collected: number; collections: number;
    productsAdded: number; newDues: number; newDueCount: number; avgOrder: number; discount: number; gst: number;
    onlinePlaced: number; canceled: number;
  };
  payments: { method: string; amount: number }[];
  channels: { offline: { amount: number; orders: number }; online: { amount: number; orders: number } };
  aging: { bucket: string; amount: number; orders: number }[];
  onlineStatus: { status: string; count: number }[];
  timeline: TimelineRow[];
  products: ProductSummaryRow[];
  daily: DailyRow[];
  collections: CollectionRow[];
  newDues: DueRow[];
  added: AddedProductRow[];
  agents: AgentRow[];
  staff: StaffRow[];
  activity: ActivityRow[];
  staffList: StaffOption[];
  selectedUser: { id: number; name: string; role: string; phone: string | null; email: string; avatar: string | null; since: string } | null;
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
