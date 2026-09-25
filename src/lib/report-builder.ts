import { prisma } from "@/lib/db";
import { getBusinessRow } from "@/lib/business-row";
import { roleLabel } from "@/lib/roles";
import {
  MONTHS, type ActivityRow, type AddedProductRow, type AgentRow, type CollectionRow, type DailyRow, type DueRow,
  type ProductSummaryRow, type ReportChannel, type ReportData, type ReportFilters, type ReportPreset, type StaffRow, type TimelineRow,
} from "@/lib/report-types";

/**
 * Report Builder: everything that happened in a period — sales (store + online),
 * products sold line by line, dues created and collected, products added,
 * deliveries per agent and what each staff member did. Optionally narrowed to
 * one staff member. Same rule for a "sale" as Sales History: every store sale,
 * and online orders once delivered.
 */

const IST_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
export const istYmd = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const istStart = (ymd: string) => new Date(`${ymd}T00:00:00.000+05:30`);
const istEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:30`);
const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const addDays = (ymd: string, n: number) => istYmd(new Date(istStart(ymd).getTime() + n * DAY_MS));
const lastOfMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const r2 = (n: number) => Math.round(n * 100) / 100;

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseReportFilters(sp: Raw): ReportFilters {
  const today = istYmd(new Date());
  const presets: ReportPreset[] = ["today", "yesterday", "this_month", "prev_month", "month", "custom"];
  let preset = (presets.includes(one(sp.range) as ReportPreset) ? one(sp.range) : "today") as ReportPreset;
  let from = today, to = today;
  if (preset === "yesterday") from = to = addDays(today, -1);
  else if (preset === "this_month") { from = `${today.slice(0, 7)}-01`; to = today; }
  else if (preset === "prev_month") { const p = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7); from = `${p}-01`; to = lastOfMonth(p); }
  else if (preset === "month") {
    const m = one(sp.m) ?? "";
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) { from = `${m}-01`; to = lastOfMonth(m) > today ? today : lastOfMonth(m); if (from > today) { from = to = today; preset = "today"; } }
    else preset = "today";
  } else if (preset === "custom") {
    const f = one(sp.from), t = one(sp.to);
    if (isYmd(f) && isYmd(t)) { from = f <= t ? f : t; to = f <= t ? t : f; } else preset = "today";
  }
  const ch = one(sp.channel);
  const channel: ReportChannel = ch === "offline" || ch === "online" ? ch : "all";
  const uid = Number(one(sp.user));
  return { preset, from, to, channel, userId: Number.isInteger(uid) && uid > 0 ? uid : null };
}

const fmtDay = (ymd: string, year = true) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}${year ? ` ${y}` : ""}`;
};
export function rangeLabel(f: ReportFilters): string {
  if (f.from === f.to) return fmtDay(f.from);
  if (f.preset === "month" || f.preset === "prev_month" || (f.from.endsWith("-01") && f.to === lastOfMonth(f.from.slice(0, 7)))) {
    const [y, m] = f.from.split("-").map(Number);
    if (f.to.slice(0, 7) === f.from.slice(0, 7)) return `${MONTHS[m - 1]} ${y}`;
  }
  return `${fmtDay(f.from, f.from.slice(0, 4) !== f.to.slice(0, 4))} – ${fmtDay(f.to)}`;
}

const staffName = (u: { username: string; firstName: string | null; lastName: string | null }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.username;

/** Groups a payment method into the report's buckets. */
function methodBucket(m: string): string {
  const s = m.toLowerCase();
  if (/cash|cod/.test(s)) return "Cash";
  if (/upi|gpay|phonepe|paytm/.test(s)) return "UPI";
  if (/card/.test(s)) return "Card";
  if (/online|razorpay|net ?bank|wallet/.test(s)) return "Online";
  return "Other";
}

export async function getReport(f: ReportFilters): Promise<ReportData> {
  const gte = istStart(f.from), lte = istEnd(f.to);
  const inRange = { gte, lte };
  const channelWhere =
    f.channel === "offline" ? { orderType: "offline" }
    : f.channel === "online" ? { orderType: "online", orderStatus: "Delivered" }
    : { OR: [{ orderType: "offline" }, { orderType: "online", orderStatus: "Delivered" }] };

  const [biz, users, orders, onlineAll, credits, payments, addedRaw, logs, deliveryOrders] = await Promise.all([
    getBusinessRow().catch(() => null),
    prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true, firstName: true, lastName: true, role: true, phone: true, email: true, avatar: true, createdAt: true, status: true } }),
    prisma.ecomOrder.findMany({
      where: { AND: [channelWhere, { createdAt: inRange }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, orderNumber: true, createdAt: true, customerName: true, isGuest: true, orderType: true, orderStatus: true,
        paymentMethod: true, totalAmount: true, discountAmount: true, gstAmount: true, deliveryAgentId: true,
        customer: { select: { phone: true } },
        items: { select: { id: true, productId: true, productName: true, qty: true, price: true, gstAmount: true, product: { select: { sku: true, category: { select: { name: true } } } } } },
        payments: { select: { paymentMethod: true, amount: true } },
        credits: { select: { id: true, amount: true, amountPaid: true, status: true, createdAt: true } },
        events: { where: { type: "placed", userId: { not: null } }, select: { userId: true }, take: 1 },
      },
    }),
    f.channel === "offline" ? Promise.resolve([]) : prisma.ecomOrder.findMany({ where: { orderType: "online", createdAt: inRange }, select: { orderStatus: true } }),
    prisma.ecomCredit.findMany({
      where: { createdAt: inRange }, orderBy: { createdAt: "desc" },
      select: { id: true, orderId: true, customerName: true, customerPhone: true, amount: true, amountPaid: true, promisedDate: true, status: true, createdAt: true, order: { select: { orderNumber: true, orderType: true, deliveryAgentId: true } } },
    }),
    prisma.ecomCreditPayment.findMany({
      where: { createdAt: inRange }, orderBy: { createdAt: "desc" },
      select: { id: true, receiptNumber: true, amount: true, paymentMethod: true, createdBy: true, createdAt: true, credit: { select: { customerName: true, orderId: true, order: { select: { orderNumber: true, orderType: true } } } } },
    }),
    prisma.ecomProduct.findMany({
      where: { createdAt: inRange }, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, sku: true, price: true, salePrice: true, stockQty: true, createdAt: true, category: { select: { name: true } } },
    }),
    prisma.activityLog.findMany({
      where: { createdAt: inRange, ...(f.userId ? {} : { actionType: { in: ["ecom_pos_sale", "ecom_product_create"] } }) },
      orderBy: { createdAt: "desc" }, take: 20_000,
      select: { id: true, userId: true, actionType: true, description: true, createdAt: true },
    }),
    prisma.ecomOrder.findMany({
      where: { deliveryAgentId: { not: null }, OR: [{ assignedAt: inRange }, { deliveredAt: inRange }] },
      select: { id: true, deliveryAgentId: true, assignedAt: true, deliveredAt: true, orderStatus: true, totalAmount: true },
    }),
  ]);

  const nameOf = new Map(users.map((u) => [u.id, staffName(u)]));
  const userName = (id: number | null | undefined) => (id ? nameOf.get(id) ?? `User #${id}` : null);

  // Who made each store sale: the order's own "placed" event, or (older sales) the activity log line.
  const soldByNumber = new Map<string, number>();
  const productBy = new Map<number, number>();
  for (const l of logs) {
    if (l.actionType === "ecom_pos_sale") { const m = l.description.match(/POS Sale:\s*(\S+)/); if (m) soldByNumber.set(m[1], l.userId); }
    if (l.actionType === "ecom_product_create") { const m = l.description.match(/\(ID:\s*(\d+)\)/); if (m) productBy.set(Number(m[1]), l.userId); }
  }
  const sellerOf = (o: (typeof orders)[number]) => o.events[0]?.userId ?? soldByNumber.get(o.orderNumber) ?? null;
  const staffOf = (o: (typeof orders)[number]) => (o.orderType === "offline" ? sellerOf(o) : o.deliveryAgentId);

  // One staff member: only the sales they made or delivered.
  const sales = f.userId ? orders.filter((o) => staffOf(o) === f.userId || sellerOf(o) === f.userId) : orders;
  const saleIds = new Set(sales.map((o) => o.id));

  // ── Sales, lines, payments, aging ───────────────────────────────────────
  const timeline: TimelineRow[] = [];
  const productMap = new Map<number, ProductSummaryRow>();
  const payMap = new Map<string, number>();
  const aging = [
    { bucket: "0 – 30 days", amount: 0, orders: 0 }, { bucket: "31 – 60 days", amount: 0, orders: 0 },
    { bucket: "61 – 90 days", amount: 0, orders: 0 }, { bucket: "90+ days", amount: 0, orders: 0 },
  ];
  const channels = { offline: { amount: 0, orders: 0 }, online: { amount: 0, orders: 0 } };
  const daily = new Map<string, DailyRow>();
  const dayRow = (day: string) => {
    let d = daily.get(day);
    if (!d) daily.set(day, (d = { day, orders: 0, offline: 0, online: 0, units: 0, sales: 0, due: 0, collected: 0 }));
    return d;
  };
  let salesTotal = 0, units = 0, lines = 0, dueTotal = 0, dueOrders = 0, discount = 0, gst = 0;
  const now = Date.now();

  for (const o of sales) {
    const total = Number(o.totalAmount);
    const open = o.credits.filter((c) => c.status !== "paid");
    const due = r2(open.reduce((s, c) => s + Math.max(0, Number(c.amount) - Number(c.amountPaid)), 0));
    const dueAtSale = o.credits.reduce((s, c) => s + Number(c.amount), 0);
    const collectedLater = o.credits.reduce((s, c) => s + Number(c.amountPaid), 0);
    salesTotal += total; discount += Number(o.discountAmount); gst += Number(o.gstAmount);
    if (due > 0.004) { dueTotal += due; dueOrders++; }
    const ch = o.orderType === "offline" ? "offline" : "online";
    channels[ch].amount += total; channels[ch].orders++;

    // Paid at the sale (by method), paid later against the due, still due.
    // Never more than was actually owed at the counter (older bills stored the cash handed over, change included).
    const paidAtSale = Math.max(0, total - dueAtSale);
    let atSale = o.payments.length ? o.payments.map((p) => ({ m: p.paymentMethod, a: Number(p.amount) })) : [{ m: o.paymentMethod, a: paidAtSale }];
    const given = atSale.reduce((sum, p) => sum + p.a, 0);
    if (given > paidAtSale + 0.004) atSale = atSale.map((p) => ({ m: p.m, a: given > 0 ? (p.a * paidAtSale) / given : 0 }));
    for (const p of atSale) payMap.set(methodBucket(p.m), (payMap.get(methodBucket(p.m)) ?? 0) + p.a);
    if (collectedLater > 0) payMap.set("Collected later", (payMap.get("Collected later") ?? 0) + collectedLater);
    if (due > 0.004) payMap.set("Due", (payMap.get("Due") ?? 0) + due);

    for (const c of open) {
      const bal = Math.max(0, Number(c.amount) - Number(c.amountPaid));
      if (bal <= 0.004) continue;
      const age = (now - c.createdAt.getTime()) / DAY_MS;
      const b = aging[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3];
      b.amount += bal; b.orders++;
    }

    const day = dayRow(istYmd(o.createdAt));
    day.orders++; day[ch]++; day.sales += total; day.due += due;

    const payLabel = o.payments.length > 1 ? o.payments.map((p) => p.paymentMethod).join(" + ") : o.paymentMethod;
    const staff = userName(staffOf(o));
    o.items.forEach((it, i) => {
      const lineTotal = Number(it.price) * it.qty;
      units += it.qty; lines++; day.units += it.qty;
      timeline.push({
        key: `${o.id}-${it.id}`, at: o.createdAt.toISOString(), orderId: o.id, orderNumber: o.orderNumber, channel: ch, status: o.orderStatus,
        customer: o.customerName || (o.isGuest ? "Guest" : "Walk-in Customer"), phone: o.customer?.phone ?? null,
        product: it.productName, sku: it.product?.sku ?? null, category: it.product?.category?.name ?? null,
        qty: it.qty, unitPrice: Number(it.price), total: r2(lineTotal), gst: Number(it.gstAmount), payment: payLabel,
        due: i === 0 ? due : null, staff,
      });
      const p = productMap.get(it.productId) ?? { productId: it.productId, name: it.productName, sku: it.product?.sku ?? null, category: it.product?.category?.name ?? null, qty: 0, revenue: 0, orders: 0, lastSoldAt: o.createdAt.toISOString() };
      p.qty += it.qty; p.revenue = r2(p.revenue + lineTotal); p.orders++;
      if (o.createdAt.toISOString() > p.lastSoldAt) p.lastSoldAt = o.createdAt.toISOString();
      productMap.set(it.productId, p);
    });
  }

  // ── Dues created / collected in the period ──────────────────────────────
  const creditsShown = credits.filter((c) =>
    (f.channel === "all" || (f.channel === "offline" ? c.order.orderType === "offline" : c.order.orderType === "online"))
    && (!f.userId || saleIds.has(c.orderId)));
  const newDues: DueRow[] = creditsShown.map((c) => ({
    key: `d${c.id}`, at: c.createdAt.toISOString(), orderId: c.orderId, orderNumber: c.order.orderNumber, customer: c.customerName, phone: c.customerPhone,
    amount: Number(c.amount), paid: Number(c.amountPaid), balance: r2(Math.max(0, Number(c.amount) - Number(c.amountPaid))),
    promised: c.promisedDate ? c.promisedDate.toISOString() : null, status: c.status,
  }));

  const paymentsShown = payments.filter((p) =>
    (f.channel === "all" || (f.channel === "offline" ? p.credit.order?.orderType !== "online" : p.credit.order?.orderType === "online"))
    && (!f.userId || p.createdBy === f.userId));
  const collections: CollectionRow[] = paymentsShown.map((p) => ({
    key: `c${p.id}`, at: p.createdAt.toISOString(), receipt: p.receiptNumber, customer: p.credit.customerName,
    orderId: p.credit.orderId, orderNumber: p.credit.order?.orderNumber ?? null, method: p.paymentMethod, amount: Number(p.amount), by: userName(p.createdBy),
  }));
  for (const c of collections) dayRow(istYmd(new Date(c.at))).collected += c.amount;

  // ── Products added ──────────────────────────────────────────────────────
  const added: AddedProductRow[] = addedRaw
    .map((p) => ({
      id: p.id, at: p.createdAt.toISOString(), name: p.name, sku: p.sku, category: p.category?.name ?? null,
      price: Number(p.salePrice ?? p.price), stock: p.stockQty, by: userName(productBy.get(p.id)),
    }))
    .filter((p) => !f.userId || productBy.get(p.id) === f.userId);

  // ── Deliveries per agent ────────────────────────────────────────────────
  const agentMap = new Map<number, AgentRow & { _mins: number[] }>();
  for (const o of deliveryOrders) {
    const id = o.deliveryAgentId!;
    if (f.userId && id !== f.userId) continue;
    const a = agentMap.get(id) ?? { userId: id, name: userName(id) ?? "", assigned: 0, delivered: 0, pending: 0, canceled: 0, deliveredValue: 0, avgMinutes: null, _mins: [] };
    const assignedIn = !!o.assignedAt && o.assignedAt >= gte && o.assignedAt <= lte;
    const deliveredIn = o.orderStatus === "Delivered" && !!o.deliveredAt && o.deliveredAt >= gte && o.deliveredAt <= lte;
    if (assignedIn) {
      a.assigned++;
      if (o.orderStatus === "Canceled") a.canceled++;
      else if (o.orderStatus !== "Delivered") a.pending++;
    }
    if (deliveredIn) {
      a.delivered++; a.deliveredValue = r2(a.deliveredValue + Number(o.totalAmount));
      if (o.assignedAt) a._mins.push((o.deliveredAt!.getTime() - o.assignedAt.getTime()) / 60_000);
    }
    agentMap.set(id, a);
  }
  const agents: AgentRow[] = [...agentMap.values()].map(({ _mins, ...a }) => ({ ...a, avgMinutes: _mins.length ? Math.round(_mins.reduce((s, m) => s + m, 0) / _mins.length) : null }))
    .sort((a, b) => b.delivered - a.delivered || b.assigned - a.assigned);

  // ── Staff performance ───────────────────────────────────────────────────
  const staffMap = new Map<number, StaffRow>();
  const staffRow = (id: number) => {
    let s = staffMap.get(id);
    if (!s) { const u = users.find((x) => x.id === id); staffMap.set(id, (s = { userId: id, name: userName(id) ?? "", role: u ? roleLabel(u.role) : "", posSales: 0, posAmount: 0, collections: 0, collectedAmount: 0, delivered: 0, productsAdded: 0, actions: 0 })); }
    return s;
  };
  for (const o of sales) if (o.orderType === "offline") { const id = sellerOf(o); if (id) { const s = staffRow(id); s.posSales++; s.posAmount = r2(s.posAmount + Number(o.totalAmount)); } }
  for (const p of paymentsShown) if (p.createdBy) { const s = staffRow(p.createdBy); s.collections++; s.collectedAmount = r2(s.collectedAmount + Number(p.amount)); }
  for (const a of agents) staffRow(a.userId).delivered += a.delivered;
  for (const p of added) { const id = productBy.get(p.id); if (id) staffRow(id).productsAdded++; }
  const staff = [...staffMap.values()].filter((s) => !f.userId || s.userId === f.userId).sort((a, b) => b.posAmount + b.collectedAmount - (a.posAmount + a.collectedAmount));

  const activity: ActivityRow[] = f.userId
    ? logs.filter((l) => l.userId === f.userId).slice(0, 1000).map((l) => ({ key: `a${l.id}`, at: l.createdAt.toISOString(), action: l.actionType, description: l.description }))
    : [];
  if (f.userId) staffRow(f.userId).actions = activity.length;

  // ── Online orders by status ─────────────────────────────────────────────
  const statusCount = new Map<string, number>();
  for (const o of onlineAll) statusCount.set(o.orderStatus, (statusCount.get(o.orderStatus) ?? 0) + 1);
  const onlineStatus = ["Pending", "In Progress", "Out for Delivery", "Delivered", "Canceled"]
    .map((status) => ({ status, count: statusCount.get(status) ?? 0 }))
    .concat([...statusCount.entries()].filter(([s]) => !["Pending", "In Progress", "Out for Delivery", "Delivered", "Canceled"].includes(s)).map(([status, count]) => ({ status, count })));

  // Every day of the period, including quiet ones (up to ~3 months).
  const days: DailyRow[] = [];
  const spanDays = Math.round((istStart(f.to).getTime() - istStart(f.from).getTime()) / DAY_MS) + 1;
  if (spanDays <= 100) for (let i = 0; i < spanDays; i++) days.push(dayRow(addDays(f.from, i)));
  else days.push(...daily.values());
  days.sort((a, b) => b.day.localeCompare(a.day));
  for (const d of days) { d.sales = r2(d.sales); d.due = r2(d.due); d.collected = r2(d.collected); }

  const u = f.userId ? users.find((x) => x.id === f.userId) : null;
  const phones = Array.isArray(biz?.contactNumbers) ? (biz!.contactNumbers as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()) : biz?.phone ? [biz.phone] : [];
  const methodOrder = ["Cash", "UPI", "Card", "Online", "Other", "Collected later", "Due"];

  return {
    filters: f,
    rangeLabel: rangeLabel(f),
    generatedAt: new Date().toISOString(),
    business: { name: biz?.businessName ?? "My Store", tagline: biz?.tagline ?? null, logo: biz?.logo ?? null, address: biz?.address ?? null, phones, email: biz?.email ?? null, gstin: biz?.gstin ?? null },
    kpis: {
      sales: r2(salesTotal), orders: sales.length, units, lines, due: r2(dueTotal), dueOrders,
      collected: r2(collections.reduce((s, c) => s + c.amount, 0)), collections: collections.length,
      productsAdded: added.length, newDues: r2(newDues.reduce((s, d) => s + d.amount, 0)), newDueCount: newDues.length,
      avgOrder: sales.length ? r2(salesTotal / sales.length) : 0, discount: r2(discount), gst: r2(gst),
      onlinePlaced: onlineAll.length, canceled: statusCount.get("Canceled") ?? 0,
    },
    payments: [...payMap.entries()].map(([method, amount]) => ({ method, amount: r2(amount) })).filter((p) => p.amount > 0.004)
      .sort((a, b) => methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method)),
    channels: { offline: { amount: r2(channels.offline.amount), orders: channels.offline.orders }, online: { amount: r2(channels.online.amount), orders: channels.online.orders } },
    aging: aging.map((a) => ({ ...a, amount: r2(a.amount) })),
    onlineStatus,
    timeline,
    products: [...productMap.values()].sort((a, b) => b.revenue - a.revenue),
    daily: days,
    collections,
    newDues,
    added,
    agents,
    staff,
    activity,
    staffList: users.filter((x) => x.status === "active" || x.id === f.userId).map((x) => ({ id: x.id, name: staffName(x), role: roleLabel(x.role) })),
    selectedUser: u ? { id: u.id, name: staffName(u), role: roleLabel(u.role), phone: u.phone, email: u.email, avatar: u.avatar, since: u.createdAt.toISOString() } : null,
  };
}
