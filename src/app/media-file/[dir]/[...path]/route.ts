import { servePublicFile } from "@/lib/serve-public-file";

/**
 * Every /uploads/… and /files/… request is sent here by the middleware, so all
 * of them get a long browser cache and old JPEG/PNG photos go out as WebP
 * (Next's own public-folder serving sends max-age=0 and the original bytes).
 */
export async function GET(req: Request, { params }: { params: Promise<{ dir: string; path: string[] }> }) {
  const { dir, path } = await params;
  if (dir !== "uploads" && dir !== "files") return new Response("Not found", { status: 404 });
  return servePublicFile(dir, path, req.headers.get("accept") ?? "");
}
