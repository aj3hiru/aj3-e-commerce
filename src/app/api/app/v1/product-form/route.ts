import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appSession } from "@/lib/app-api";
import { hasPermission } from "@/lib/admin-auth";
import { withApiErrors } from "@/lib/api-errors";

/** Choices of the product form (same lists as /admin/ecommerce/products/add): badge tags, item types, GST rates. */
async function handleGET() {
  const s = await appSession();
  if (s instanceof NextResponse) return s;
  if (!hasPermission(s.permissions, "ecommerce", "manage_products")) return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  const [tags, gst] = await Promise.all([
    prisma.ecomProductTag.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { slug: true, label: true, tagGroup: true, status: true } }),
    prisma.ecomGstRate.findMany({ orderBy: { rate: "asc" }, select: { label: true, rate: true, isDefault: true } }),
  ]);
  type Tag = { slug: string; label: string; tagGroup: string; status: string };
  const rows = tags as Tag[];
  return NextResponse.json({
    success: true,
    form: {
      badges: rows.filter((t) => t.tagGroup === "badge" && (t.status === "active" || t.slug === "none")).map((t) => ({ slug: t.slug, label: t.label })),
      itemTypes: rows.filter((t) => t.tagGroup === "item_type" && (t.status === "active" || t.slug === "normal")).map((t) => ({ slug: t.slug, label: t.label })),
      gstRates: (gst as { label: string; rate: unknown; isDefault: boolean }[]).map((g) => ({ label: g.label, rate: Number(g.rate), isDefault: g.isDefault })),
      units: ["KG", "Gram", "Liter", "ml", "cm", "Meter", "Piece"],
    },
  });
}

export const GET = withApiErrors(handleGET);
