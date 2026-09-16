import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { logActivity } from "@/lib/activity-log";
import { generateSlug } from "@/lib/slug";
import { detectFileType, ALLOWED_EXTENSIONS, MAX_UPLOAD_SIZE } from "@/lib/media-types";

/** Verified against file-manager.php's upload_file action. PDFs are stored under
 *  /files/, every other allowed type under /uploads/ — matching the original's
 *  two-directory split. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "files", "access_file_manager")) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded or upload error." }, { status: 400 });

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: "File type not allowed." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json({ error: "File too large (max 50MB)." }, { status: 400 });
  }

  const fileType = detectFileType(ext);
  const subdir = fileType === "pdf" ? "files" : "uploads";
  const slugBase = generateSlug(file.name.replace(/\.[^.]+$/, ""));
  const filename = `${slugBase}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const dbPath = `${subdir}/${filename}`;

  const dirAbs = path.join(process.cwd(), "public", subdir);
  await mkdir(dirAbs, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dirAbs, filename), buffer);

  try {
    const created = await prisma.media.create({ data: { filePath: dbPath, fileType, altText: "" } });
    await logActivity(req, session.userId, "media_upload", `Uploaded ${fileType}: ${file.name} (ID: ${created.id})`);
    return NextResponse.json({ success: true, id: created.id, path: dbPath, file_type: fileType, name: file.name });
  } catch {
    return NextResponse.json({ error: "Failed to save file record." }, { status: 500 });
  }
}

/** List media with optional type filter + search + pagination — supports the
 *  file-manager grid view. */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "files", "access_file_manager")) {
    return NextResponse.json({ error: "Access Denied" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "all";
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = 24;

  const where: Record<string, unknown> = {};
  if (type !== "all") where.fileType = type;
  if (search) {
    where.OR = [
      { filePath: { contains: search } },
      { title: { contains: search } },
      { altText: { contains: search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.media.findMany({ where, orderBy: { uploadedAt: "desc" }, take: perPage, skip: (page - 1) * perPage }),
    prisma.media.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) });
}
