import { servePublicFile } from "@/lib/serve-public-file";

/** File Manager PDFs (see lib/serve-public-file.ts for why this route exists). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return servePublicFile("files", (await params).path);
}
