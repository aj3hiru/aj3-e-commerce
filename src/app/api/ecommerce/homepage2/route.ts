import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { saveUploadedImage, deleteUploadedImage } from "@/lib/upload";
import { reorderByIds } from "@/lib/reorder";
import { withApiErrors } from "@/lib/api-errors";

const VALID_SECTION_TYPES = ["category_row", "product_grid", "festive_banner", "manual_products"];
const VALID_SOURCE_TYPES = ["manual", "category", "latest"];
const VALID_CARD_DESIGNS = ["design1", "design2", "design3", "design4"];

/**
 * Same action set as /api/ecommerce/homepage's dispatcher (verified against
 * homepage-settings.php), plus reorder_* actions this page's drag-and-drop
 * needs that the original single-step move_slide/move_section/move_strip_category
 * don't cover well. JSON body for everything except the two actions that
 * upload a file (add_slide, add_section with a festive banner image, edit_slide),
 * which stay multipart/form-data.
 */
async function handlePOST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_homepage")) {
    return NextResponse.json({ success: false, message: "Access Denied" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const isForm = contentType.includes("multipart/form-data");
  const form = isForm ? await req.formData() : null;
  const body = isForm ? null : await req.json().catch(() => ({}));
  const get = (key: string): string => (isForm ? String(form!.get(key) ?? "") : String(body?.[key] ?? "")).trim();
  const getFile = (key: string): File | null => { const f = isForm ? form!.get(key) : null; return f instanceof File && f.size > 0 ? f : null; };
  const action = get("action");

  try {
    switch (action) {
      case "add_slide": {
        const imageFile = getFile("image");
        if (!imageFile) return NextResponse.json({ success: false, message: "Please choose an image for the slide." }, { status: 400 });
        const image = await saveUploadedImage(imageFile, "ecommerce/homepage", "slide");
        const max = await prisma.ecomHomeSlide.aggregate({ _max: { sortOrder: true } });
        const created = await prisma.ecomHomeSlide.create({ data: { image, buttonLink: get("button_link") || "#", sortOrder: (max._max.sortOrder ?? 0) + 10 } });
        await logActivity(req, session.userId, "ecom_homepage_update", `Added homepage slide (ID: ${created.id})`);
        return NextResponse.json({ success: true, id: created.id, image: created.image });
      }
      case "edit_slide": {
        const id = Number(get("id"));
        const imageFile = getFile("image");
        const data: { buttonLink: string; image?: string } = { buttonLink: get("button_link") || "#" };
        let oldImage: string | null = null;
        if (imageFile) {
          const existing = await prisma.ecomHomeSlide.findUnique({ where: { id }, select: { image: true } });
          oldImage = existing?.image ?? null;
          data.image = await saveUploadedImage(imageFile, "ecommerce/homepage", "slide");
        }
        await prisma.ecomHomeSlide.update({ where: { id }, data });
        if (oldImage && data.image && oldImage !== data.image) await deleteUploadedImage(oldImage);
        await logActivity(req, session.userId, "ecom_homepage_update", `Edited homepage slide (ID: ${id})`);
        return NextResponse.json({ success: true, image: data.image });
      }
      case "delete_slide": {
        const id = Number(get("id"));
        const slide = await prisma.ecomHomeSlide.findUnique({ where: { id } });
        await prisma.ecomHomeSlide.delete({ where: { id } });
        await deleteUploadedImage(slide?.image);
        await logActivity(req, session.userId, "ecom_homepage_update", `Deleted homepage slide (ID: ${id})`);
        return NextResponse.json({ success: true });
      }
      case "toggle_slide": {
        const id = Number(get("id"));
        const slide = await prisma.ecomHomeSlide.findUnique({ where: { id } });
        if (slide) await prisma.ecomHomeSlide.update({ where: { id }, data: { status: slide.status === "active" ? "inactive" : "active" } });
        return NextResponse.json({ success: true });
      }
      case "reorder_slides": {
        const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
        await reorderByIds(prisma.ecomHomeSlide, ids);
        return NextResponse.json({ success: true });
      }

      case "add_strip_category": {
        const categoryId = Number(get("category_id"));
        if (!categoryId) return NextResponse.json({ success: false, message: "Please choose a category." }, { status: 400 });
        const exists = await prisma.ecomHomeCategoryStrip.findFirst({ where: { categoryId } });
        if (exists) return NextResponse.json({ success: false, message: "That category is already in the strip." }, { status: 409 });
        const max = await prisma.ecomHomeCategoryStrip.aggregate({ _max: { sortOrder: true } });
        const created = await prisma.ecomHomeCategoryStrip.create({ data: { categoryId, sortOrder: (max._max.sortOrder ?? 0) + 10 } });
        await logActivity(req, session.userId, "ecom_homepage_update", `Added category to homepage strip (ID: ${created.id})`);
        return NextResponse.json({ success: true, id: created.id });
      }
      case "delete_strip_category": {
        const id = Number(get("id"));
        await prisma.ecomHomeCategoryStrip.delete({ where: { id } });
        return NextResponse.json({ success: true });
      }
      case "reorder_strip": {
        const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
        await reorderByIds(prisma.ecomHomeCategoryStrip, ids);
        return NextResponse.json({ success: true });
      }
      case "save_strip_settings": {
        const mode = ["pinned", "all"].includes(get("strip_mode")) ? get("strip_mode") : "pinned";
        const count = Math.max(1, Math.min(30, Number(get("strip_count")) || 10));
        await prisma.ecomHomeSetting.upsert({ where: { settingKey: "category_strip_mode" }, create: { settingKey: "category_strip_mode", settingValue: mode }, update: { settingValue: mode } });
        await prisma.ecomHomeSetting.upsert({ where: { settingKey: "category_strip_count" }, create: { settingKey: "category_strip_count", settingValue: String(count) }, update: { settingValue: String(count) } });
        return NextResponse.json({ success: true });
      }

      case "add_section": {
        const sectionType = VALID_SECTION_TYPES.includes(get("section_type")) ? get("section_type") : "category_row";
        const sourceType = VALID_SOURCE_TYPES.includes(get("source_type")) ? get("source_type") : "latest";
        const cardDesign = VALID_CARD_DESIGNS.includes(get("card_design")) ? get("card_design") : "design1";
        const bannerImageFile = sectionType === "festive_banner" ? getFile("banner_image") : null;
        const bannerImage = bannerImageFile ? await saveUploadedImage(bannerImageFile, "ecommerce/homepage", "banner") : null;
        const max = await prisma.ecomHomeSection.aggregate({ _max: { sortOrder: true } });
        const created = await prisma.ecomHomeSection.create({
          data: {
            sectionType, title: get("title") || null,
            categoryId: get("category_id") ? Number(get("category_id")) : null,
            sourceType, cardDesign, productLimit: Number(get("product_limit")) || 10,
            bannerText: get("banner_text") || null, bannerImage,
            dismissible: isForm ? form!.get("dismissible") !== null : body?.dismissible === true,
            sortOrder: (max._max.sortOrder ?? 0) + 10,
          },
        });
        await logActivity(req, session.userId, "ecom_homepage_update", `Added homepage section: ${sectionType} (ID: ${created.id})`);
        return NextResponse.json({ success: true, id: created.id });
      }
      case "edit_section": {
        const id = Number(get("id"));
        const sourceType = VALID_SOURCE_TYPES.includes(get("source_type")) ? get("source_type") : "latest";
        const cardDesign = VALID_CARD_DESIGNS.includes(get("card_design")) ? get("card_design") : "design1";
        const bannerImageFile = getFile("banner_image");
        let oldBanner: string | null = null;
        const data: Record<string, unknown> = {
          title: get("title") || null,
          categoryId: get("category_id") ? Number(get("category_id")) : null,
          sourceType, cardDesign, productLimit: Number(get("product_limit")) || 10,
          bannerText: get("banner_text") || null,
          dismissible: isForm ? form!.get("dismissible") !== null : body?.dismissible === true,
        };
        if (bannerImageFile) {
          const existing = await prisma.ecomHomeSection.findUnique({ where: { id }, select: { bannerImage: true } });
          oldBanner = existing?.bannerImage ?? null;
          data.bannerImage = await saveUploadedImage(bannerImageFile, "ecommerce/homepage", "banner");
        }
        await prisma.ecomHomeSection.update({ where: { id }, data });
        if (oldBanner && data.bannerImage && oldBanner !== data.bannerImage) await deleteUploadedImage(oldBanner);
        await logActivity(req, session.userId, "ecom_homepage_update", `Edited homepage section (ID: ${id})`);
        return NextResponse.json({ success: true });
      }
      case "delete_section": {
        const id = Number(get("id"));
        const section = await prisma.ecomHomeSection.findUnique({ where: { id } });
        await prisma.ecomHomeSection.delete({ where: { id } });
        await deleteUploadedImage(section?.bannerImage);
        await logActivity(req, session.userId, "ecom_homepage_update", `Deleted homepage section (ID: ${id})`);
        return NextResponse.json({ success: true });
      }
      case "toggle_section": {
        const id = Number(get("id"));
        const section = await prisma.ecomHomeSection.findUnique({ where: { id } });
        if (section) await prisma.ecomHomeSection.update({ where: { id }, data: { status: section.status === "active" ? "inactive" : "active" } });
        return NextResponse.json({ success: true });
      }
      case "reorder_sections": {
        const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
        await reorderByIds(prisma.ecomHomeSection, ids);
        return NextResponse.json({ success: true });
      }

      case "add_section_item": {
        const sectionId = Number(get("section_id"));
        const imageFile = getFile("custom_image");
        const customImage = imageFile ? await saveUploadedImage(imageFile, "ecommerce/homepage", "catcard") : null;
        const max = await prisma.ecomHomeSectionItem.aggregate({ _max: { sortOrder: true }, where: { sectionId } });
        const created = await prisma.ecomHomeSectionItem.create({
          data: {
            sectionId,
            categoryId: get("category_id") ? Number(get("category_id")) : null,
            productId: get("product_id") ? Number(get("product_id")) : null,
            customLabel: get("custom_label") || null, customImage,
            sortOrder: (max._max.sortOrder ?? 0) + 10,
          },
        });
        return NextResponse.json({ success: true, id: created.id });
      }
      case "delete_section_item": {
        const id = Number(get("id"));
        await prisma.ecomHomeSectionItem.delete({ where: { id } });
        return NextResponse.json({ success: true });
      }
      case "reorder_section_items": {
        const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
        await reorderByIds(prisma.ecomHomeSectionItem, ids);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    console.error("homepage2 action failed", action, e);
    return NextResponse.json({ success: false, message: "Could not save that change. Please try again." }, { status: 500 });
  }
}

export const POST = withApiErrors(handlePOST);
