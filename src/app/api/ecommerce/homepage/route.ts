import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { saveUploadedImage } from "@/lib/upload";
import { moveItem } from "@/lib/move-item";

const VALID_SECTION_TYPES = ["category_row", "product_grid", "festive_banner", "manual_products"];
const VALID_SOURCE_TYPES = ["manual", "category", "latest"];
const VALID_CARD_DESIGNS = ["design1", "design2", "design3", "design4"];

/** Verified 1:1 against the single-file action dispatcher in
 *  admin/ecommerce/homepage-settings.php — every action below matches one
 *  `elseif ($action === '...')` branch from the original. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const form = await req.formData();
  const action = form.get("action") as string | null;
  const str = (key: string) => ((form.get(key) as string | null) ?? "").trim();
  const id = () => Number(form.get("id"));

  switch (action) {
    case "add_slide": {
      const imageFile = form.get("image") as File | null;
      if (!imageFile || imageFile.size === 0) {
        return NextResponse.json({ success: false, message: "Please choose an image for the slide." }, { status: 400 });
      }
      const image = await saveUploadedImage(imageFile, "ecommerce/homepage", "slide");
      const max = await prisma.ecomHomeSlide.aggregate({ _max: { sortOrder: true } });
      await prisma.ecomHomeSlide.create({ data: { image, buttonLink: str("button_link") || "#", sortOrder: (max._max.sortOrder ?? 0) + 1 } });
      break;
    }
    case "edit_slide": {
      const imageFile = form.get("image") as File | null;
      const data: Record<string, unknown> = { buttonLink: str("button_link") || "#" };
      if (imageFile && imageFile.size > 0) data.image = await saveUploadedImage(imageFile, "ecommerce/homepage", "slide");
      await prisma.ecomHomeSlide.update({ where: { id: id() }, data });
      break;
    }
    case "delete_slide":
      await prisma.ecomHomeSlide.delete({ where: { id: id() } });
      break;
    case "toggle_slide": {
      const slide = await prisma.ecomHomeSlide.findUnique({ where: { id: id() } });
      if (slide) await prisma.ecomHomeSlide.update({ where: { id: id() }, data: { status: slide.status === "active" ? "inactive" : "active" } });
      break;
    }
    case "move_slide":
      await moveItem(prisma.ecomHomeSlide, id(), form.get("direction") === "up" ? "up" : "down");
      break;

    case "add_strip_category": {
      const categoryId = Number(form.get("category_id") ?? 0);
      if (categoryId <= 0) return NextResponse.json({ success: false, message: "Please choose a category." }, { status: 400 });
      const exists = await prisma.ecomHomeCategoryStrip.findFirst({ where: { categoryId } });
      if (exists) return NextResponse.json({ success: false, message: "That category is already in the strip." }, { status: 409 });
      const max = await prisma.ecomHomeCategoryStrip.aggregate({ _max: { sortOrder: true } });
      await prisma.ecomHomeCategoryStrip.create({ data: { categoryId, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
      break;
    }
    case "delete_strip_category":
      await prisma.ecomHomeCategoryStrip.delete({ where: { id: id() } });
      break;
    case "move_strip_category":
      await moveItem(prisma.ecomHomeCategoryStrip, id(), form.get("direction") === "up" ? "up" : "down");
      break;
    case "save_strip_settings": {
      const mode = ["pinned", "all"].includes(str("strip_mode")) ? str("strip_mode") : "pinned";
      const count = Math.max(1, Math.min(30, Number(form.get("strip_count")) || 10));
      await prisma.ecomHomeSetting.upsert({ where: { settingKey: "category_strip_mode" }, create: { settingKey: "category_strip_mode", settingValue: mode }, update: { settingValue: mode } });
      await prisma.ecomHomeSetting.upsert({ where: { settingKey: "category_strip_count" }, create: { settingKey: "category_strip_count", settingValue: String(count) }, update: { settingValue: String(count) } });
      break;
    }

    case "add_section": {
      const sectionType = VALID_SECTION_TYPES.includes(str("section_type")) ? str("section_type") : "category_row";
      const sourceType = VALID_SOURCE_TYPES.includes(str("source_type")) ? str("source_type") : "latest";
      const cardDesign = VALID_CARD_DESIGNS.includes(str("card_design")) ? str("card_design") : "design1";
      const bannerImageFile = sectionType === "festive_banner" ? (form.get("banner_image") as File | null) : null;
      const bannerImage = bannerImageFile && bannerImageFile.size > 0 ? await saveUploadedImage(bannerImageFile, "ecommerce/homepage", "banner") : null;
      const max = await prisma.ecomHomeSection.aggregate({ _max: { sortOrder: true } });

      await prisma.ecomHomeSection.create({
        data: {
          sectionType, title: str("title") || null,
          categoryId: form.get("category_id") ? Number(form.get("category_id")) : null,
          sourceType, cardDesign,
          productLimit: Number(form.get("product_limit")) || 10,
          bannerText: str("banner_text") || null,
          bannerImage,
          dismissible: form.get("dismissible") !== null,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      });
      break;
    }
    case "delete_section":
      await prisma.ecomHomeSection.delete({ where: { id: id() } });
      break;
    case "toggle_section": {
      const section = await prisma.ecomHomeSection.findUnique({ where: { id: id() } });
      if (section) await prisma.ecomHomeSection.update({ where: { id: id() }, data: { status: section.status === "active" ? "inactive" : "active" } });
      break;
    }
    case "move_section":
      await moveItem(prisma.ecomHomeSection, id(), form.get("direction") === "up" ? "up" : "down");
      break;

    case "add_section_item": {
      const sectionId = Number(form.get("section_id"));
      const imageFile = form.get("custom_image") as File | null;
      const customImage = imageFile && imageFile.size > 0 ? await saveUploadedImage(imageFile, "ecommerce/homepage", "catcard") : null;
      const max = await prisma.ecomHomeSectionItem.aggregate({ _max: { sortOrder: true }, where: { sectionId } });

      await prisma.ecomHomeSectionItem.create({
        data: {
          sectionId,
          categoryId: form.get("category_id") ? Number(form.get("category_id")) : null,
          productId: form.get("product_id") ? Number(form.get("product_id")) : null,
          customLabel: str("custom_label") || null,
          customImage,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      });
      break;
    }
    case "delete_section_item":
      await prisma.ecomHomeSectionItem.delete({ where: { id: id() } });
      break;

    default:
      return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
  }

  const returnTab = str("return_tab") || "slider";
  return NextResponse.json({ success: true, redirect: `/admin/ecommerce/homepage-settings?tab=${returnTab}` });
}
