import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { prisma } from "./db";

export interface CustomerSession {
  customerId: number;
  name: string;
}

/** Mirrors `if (!empty($_SESSION['customer_id']))` checks across shop/*.php. */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("customer_session")?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET!) as { customerId: number };
    const customer = await prisma.ecomCustomer.findUnique({ where: { id: payload.customerId } });
    if (!customer || customer.status !== "active") return null;

    return { customerId: customer.id, name: customer.name };
  } catch {
    return null;
  }
}
