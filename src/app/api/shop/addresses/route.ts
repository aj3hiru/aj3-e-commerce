import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";
import { listAddresses, parseAddress } from "@/lib/customer-addresses";

const MAX = 20;
const unauth = () => NextResponse.json({ success: false, message: "Please login first." }, { status: 401 });

/** GET: the customer's saved addresses (default first). */
export async function GET() {
  const c = await getCustomerSession();
  if (!c) return unauth();
  return NextResponse.json({ success: true, addresses: await listAddresses(c.customerId) });
}

/**
 * POST { action: "save", id?, ...fields } — add or edit (the first address becomes the default);
 *      { action: "delete", id } · { action: "default", id }.
 */
export async function POST(req: NextRequest) {
  const c = await getCustomerSession();
  if (!c) return unauth();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(body.id) || 0;
  const own = id ? await prisma.ecomCustomerAddress.findFirst({ where: { id, customerId: c.customerId }, select: { id: true, isDefault: true } }) : null;
  if (id && !own) return NextResponse.json({ success: false, message: "Address not found." }, { status: 404 });

  if (body.action === "delete" && own) {
    await prisma.ecomCustomerAddress.delete({ where: { id: own.id } });
    if (own.isDefault) { // promote the most recent one
      const next = await prisma.ecomCustomerAddress.findFirst({ where: { customerId: c.customerId }, orderBy: { updatedAt: "desc" } });
      if (next) await prisma.ecomCustomerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  } else if (body.action === "default" && own) {
    await prisma.$transaction([
      prisma.ecomCustomerAddress.updateMany({ where: { customerId: c.customerId }, data: { isDefault: false } }),
      prisma.ecomCustomerAddress.update({ where: { id: own.id }, data: { isDefault: true } }),
    ]);
  } else if (body.action === "save") {
    const parsed = parseAddress(body);
    if ("error" in parsed) return NextResponse.json({ success: false, message: parsed.error }, { status: 400 });
    const count = await prisma.ecomCustomerAddress.count({ where: { customerId: c.customerId } });
    if (!own && count >= MAX) return NextResponse.json({ success: false, message: `You can save up to ${MAX} addresses.` }, { status: 400 });
    const makeDefault = parsed.data.isDefault || count === 0 || (own?.isDefault ?? false);
    const data = { ...parsed.data, landmark: parsed.data.landmark || null, isDefault: makeDefault };
    const saved = await prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.ecomCustomerAddress.updateMany({ where: { customerId: c.customerId }, data: { isDefault: false } });
      return own
        ? tx.ecomCustomerAddress.update({ where: { id: own.id }, data })
        : tx.ecomCustomerAddress.create({ data: { ...data, customerId: c.customerId } });
    });
    return NextResponse.json({ success: true, id: saved.id, addresses: await listAddresses(c.customerId) });
  } else {
    return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ success: true, addresses: await listAddresses(c.customerId) });
}
