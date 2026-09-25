import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { withApiErrors } from "@/lib/api-errors";

async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (
    !session ||
    (!hasPermission(session.permissions, "ecommerce", "manage_credits") &&
      !hasPermission(session.permissions, "ecommerce", "manage_billing"))
  ) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const creditId = Number(body.creditId);
  const promisedDate = body.promisedDate ? new Date(body.promisedDate) : null;

  if (!Number.isInteger(creditId)) {
    return NextResponse.json({ success: false, message: "Invalid credit id" }, { status: 400 });
  }

  await prisma.ecomCredit.update({ where: { id: creditId }, data: { promisedDate } });
  return NextResponse.json({ success: true });
}

export const POST = withApiErrors(handlePOST);
