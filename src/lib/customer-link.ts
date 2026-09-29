import { prisma } from "@/lib/db";
import { customersWithPhone, hasLogin } from "@/lib/customer-phone";

/**
 * A customer made at the store counter and an online account with the same
 * mobile number are linked automatically (sign-up, login — autoLinkStoreRecords)
 * or by staff from the customer page. Linking makes them one
 * customer: the store customer's record is kept (the billing screen and staff
 * app already know it), it takes the online login, and everything of the
 * online account moves into it.
 */

export interface LinkCandidate { id: number; name: string; online: boolean; orders: number }

/** The other customer with this customer's mobile number that it could be linked with (store ↔ online), if any. */
export async function linkCandidates(customerId: number): Promise<LinkCandidate[]> {
  const me = await prisma.ecomCustomer.findUnique({ where: { id: customerId } });
  if (!me?.phone) return [];
  const others = (await customersWithPhone(me.phone)).filter((c) => c.id !== me.id && hasLogin(c) !== hasLogin(me));
  if (!others.length) return [];
  const counts = await prisma.ecomOrder.groupBy({ by: ["customerId"], where: { customerId: { in: others.map((o) => o.id) } }, _count: { _all: true } });
  return others.map((o) => ({
    id: o.id, name: o.name || "(no name)", online: hasLogin(o),
    orders: counts.find((c) => c.customerId === o.id)?._count._all ?? 0,
  }));
}

export class LinkError extends Error {}

/** Links store customer + online account (either id first). Returns the id that remains. */
export async function linkCustomers(aId: number, bId: number): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const [a, b] = await Promise.all([tx.ecomCustomer.findUnique({ where: { id: aId } }), tx.ecomCustomer.findUnique({ where: { id: bId } })]);
    if (!a || !b || a.id === b.id) throw new LinkError("Customer not found.");
    const key = (p: string | null) => (p ?? "").replace(/\D/g, "").slice(-10);
    if (key(a.phone).length < 10 || key(a.phone) !== key(b.phone)) throw new LinkError("Only customers with the same mobile number can be linked.");
    if (hasLogin(a) === hasLogin(b)) throw new LinkError("Link a store customer with an online account.");
    const store = hasLogin(a) ? b : a, online = hasLogin(a) ? a : b;

    // Everything of the online account moves to the store customer.
    const move = { where: { customerId: online.id }, data: { customerId: store.id } };
    await tx.ecomOrder.updateMany(move);
    await tx.ecomCredit.updateMany(move);
    await tx.ecomCustomerAddress.updateMany(move);
    await tx.ecomProductReview.updateMany(move);
    await tx.pushSubscription.updateMany(move);
    await tx.ecomStockAlert.updateMany(move);
    const have = new Set((await tx.ecomWishlist.findMany({ where: { customerId: store.id }, select: { productId: true } })).map((w) => w.productId));
    await tx.ecomWishlist.deleteMany({ where: { customerId: online.id, productId: { in: [...have] } } });
    await tx.ecomWishlist.updateMany(move);

    // The online login (email, password, name they chose) goes onto the store customer; the online record goes.
    await tx.ecomCustomer.delete({ where: { id: online.id } });
    await tx.ecomCustomer.update({
      where: { id: store.id },
      data: {
        customerType: "online", password: online.password, email: online.email ?? store.email,
        name: online.name.trim() || store.name, phone: online.phone ?? store.phone,
        address: store.address || online.address, status: online.status === "active" && store.status === "active" ? "active" : store.status,
      },
    });
    return store.id;
  });
}

/**
 * Automatic linking (the store owner's choice, 2026-09-29: no mobile verification): an online account takes
 * in every store customer with its mobile number. Returns the id the customer now has (the store record is
 * kept, so the session must be set for this id). Never throws — a failed link just leaves them separate.
 */
export async function autoLinkStoreRecords(customerId: number): Promise<number> {
  let id = customerId;
  try {
    const me = await prisma.ecomCustomer.findUnique({ where: { id } });
    if (!me?.phone || !hasLogin(me)) return id;
    for (const store of (await customersWithPhone(me.phone)).filter((c) => c.id !== id && !hasLogin(c))) {
      id = await linkCustomers(id, store.id);
    }
  } catch (e) {
    console.error("auto-link failed", e);
  }
  return id;
}
