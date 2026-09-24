// Lists every image under public/uploads in the File Manager (media table) that
// isn't there yet — for uploads made before product/category/customizer
// uploads registered themselves. Safe to run again. Usage:
//   node --env-file=.env.production scripts/sync-uploads-to-media.mjs
import { readdir } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const root = path.join(process.cwd(), "public");
const IMG = /\.(jpe?g|png|gif|webp|bmp)$/i;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (IMG.test(e.name)) out.push(path.relative(root, p).split(path.sep).join("/"));
  }
  return out;
}

const files = await walk(path.join(root, "uploads")).catch(() => []);
const known = new Set((await prisma.media.findMany({ select: { filePath: true } })).map((m) => m.filePath));
const missing = files.filter((f) => !known.has(f));
for (const f of missing) {
  await prisma.media.create({ data: { filePath: f, fileType: "image", altText: "", title: path.basename(f).replace(/\.[^.]+$/, "").slice(0, 190) } });
}
console.log(`images on disk: ${files.length}, already listed: ${files.length - missing.length}, added: ${missing.length}`);
await prisma.$disconnect();
