import sharp from "sharp";

/**
 * Every uploaded photo is stored as a high-quality WebP: turned the right way
 * up (camera rotation), no bigger than 2000 px on its longest side, quality
 * 85 — visually the same as the original, usually 60–90% smaller, so the shop
 * loads fast. Animated GIFs stay animated. If WebP would somehow come out
 * bigger than an image that was already WebP, the original bytes are kept.
 */
const MAX_SIDE = 2000;
const QUALITY = 85;

export async function toWebp(input: Buffer, ext: string): Promise<Buffer> {
  const animated = ext === "gif";
  const img = sharp(input, { animated, failOn: "none" }).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 0, h = (meta.pageHeight ?? meta.height) ?? 0;
  const pipeline = w > MAX_SIDE || h > MAX_SIDE
    ? img.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    : img;
  const out = await pipeline.webp({ quality: QUALITY, alphaQuality: 90, effort: 5, smartSubsample: true }).toBuffer();
  return ext === "webp" && out.length >= input.length ? input : out;
}
