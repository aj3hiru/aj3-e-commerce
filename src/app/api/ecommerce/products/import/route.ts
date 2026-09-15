import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug, makeUniqueSlug } from "@/lib/slug";

/** Minimal CSV line parser handling quoted fields with embedded commas/quotes —
 *  matches PHP's fgetcsv() behavior closely enough for the simple export format
 *  this feature round-trips with. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { fields.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/** Verified against the `action==='import'` branch of csv-import-export.php:
 *  requires name+price columns, defaults item_type to the selected default,
 *  status defaults to active unless explicitly "inactive", unique-slugs each row,
 *  skips (doesn't fail the whole batch on) rows with a blank name. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_products")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("csv") as File | null;
  const itemTypeDefault = ((form.get("item_type") as string | null) ?? "physical").trim() || "physical";

  if (!file || file.size === 0) {
    return NextResponse.json({ success: false, message: "Please choose a valid CSV file." }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return NextResponse.json({ success: false, message: "Could not read the uploaded file." }, { status: 400 });
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const required = ["name", "price"];
  const missing = required.filter((r) => !header.includes(r));
  if (missing.length > 0) {
    return NextResponse.json({
      success: false,
      message: `CSV is missing required column(s): ${missing.join(", ")}. Required columns: name, price (optional: sku, stock_qty, status).`,
    }, { status: 400 });
  }

  let imported = 0;
  let failed = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const data: Record<string, string> = {};
    header.forEach((h, idx) => (data[h] = row[idx] ?? ""));

    const name = (data.name ?? "").trim();
    const price = Number(data.price ?? 0) || 0;
    if (name === "") {
      failed++;
      continue;
    }

    const baseSlug = generateSlug(name);
    const slug = await makeUniqueSlug(baseSlug, async (s) => !!(await prisma.ecomProduct.findFirst({ where: { slug: s } })));
    const sku = (data.sku ?? "").trim();
    const stockQty = data.stock_qty !== undefined && data.stock_qty !== "" ? parseInt(data.stock_qty, 10) || 0 : 0;
    const status = (data.status ?? "").trim().toLowerCase() === "inactive" ? "inactive" : "active";

    try {
      await prisma.ecomProduct.create({
        data: { name, slug, sku: sku || null, productType: itemTypeDefault, price, stockQty, status, gstRate: 0 },
      });
      imported++;
    } catch {
      failed++;
    }
  }

  await logActivity(req, session.userId, "ecom_product_csv_import", `Imported ${imported} products via CSV (${failed} failed)`);

  return NextResponse.json({
    success: true,
    message: `Import complete: ${imported} product(s) added${failed ? `, ${failed} row(s) skipped.` : "."}`,
  });
}
