import { stat, readFile, mkdir, writeFile } from "fs/promises";
import { toWebp } from "./image-webp";
import path from "path";
import { NextResponse } from "next/server";

/**
 * `next start` only serves files that were in /public when the server
 * started, so anything uploaded afterwards (products, banners, File Manager)
 * 404'd until the next deploy. These routes run only when no static file
 * matched, and serve the file straight from disk.
 */
const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
  pdf: "application/pdf",
  mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", m4a: "audio/mp4", flac: "audio/flac",
  txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed", gz: "application/gzip", tar: "application/x-tar",
};
const INLINE = /^(image|video|audio)\/|^application\/pdf$|^text\/plain/;

/** Older uploads that are still JPEG / PNG go out as WebP (converted once, kept in .cache/webp). */
const CONVERT = new Set(["jpg", "jpeg", "png"]);
const WEBP_CACHE = path.join(process.cwd(), ".cache", "webp");

async function webpCopy(abs: string, rel: string, ext: string, mtime: Date): Promise<Buffer | null> {
  const out = path.join(WEBP_CACHE, `${rel}.webp`);
  try {
    const st = await stat(out);
    if (st.mtimeMs >= mtime.getTime()) return await readFile(out);
  } catch { /* not converted yet */ }
  try {
    const webp = await toWebp(await readFile(abs), ext);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, webp);
    return webp;
  } catch {
    return null; // unreadable image — send the original
  }
}

export async function servePublicFile(dir: "uploads" | "files", parts: string[], accept = ""): Promise<Response> {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  if (!parts.length || parts.some((p) => !p || p.startsWith(".") || p.includes("\\") || p.includes("\0"))) return notFound();
  const ext = (parts[parts.length - 1].split(".").pop() || "").toLowerCase();
  const type = TYPES[ext];
  if (!type) return notFound();
  const base = path.join(process.cwd(), "public", dir);
  const abs = path.join(base, ...parts);
  if (!abs.startsWith(base + path.sep)) return notFound();
  try {
    const st = await stat(abs);
    if (!st.isFile()) return notFound();
    const canWebp = CONVERT.has(ext) && accept.includes("image/webp");
    const webp = canWebp ? await webpCopy(abs, path.join(dir, ...parts), ext, st.mtime) : null;
    const body = webp && webp.length < st.size ? webp : await readFile(abs);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": body === webp ? "image/webp" : type,
        "Content-Length": String(body.length),
        ...(CONVERT.has(ext) ? { Vary: "Accept" } : {}),
        // Upload names are unique, so a file never changes under its URL.
        "Cache-Control": "public, max-age=31536000, immutable",
        "Last-Modified": st.mtime.toUTCString(),
        "X-Content-Type-Options": "nosniff",
        ...(INLINE.test(type) ? {} : { "Content-Disposition": "attachment" }),
      },
    });
  } catch {
    return notFound();
  }
}
