import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Verified against the `?export=csv` branch in csv-import-export.php. */
export async function GET() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }

  const products = await prisma.ecomProduct.findMany({
    select: { id: true, name: true, sku: true, productType: true, price: true, salePrice: true, stockQty: true, status: true, badgeTag: true, itemType: true },
    orderBy: { id: "asc" },
  });

  const header = ["id", "name", "sku", "product_type", "price", "sale_price", "stock_qty", "status", "badge_tag", "item_type"];
  const lines = [header.join(",")];
  for (const p of products) {
    lines.push(
      [p.id, p.name, p.sku, p.productType, p.price, p.salePrice, p.stockQty, p.status, p.badgeTag, p.itemType]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = lines.join("\r\n");
  const filename = `products-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  });
}
