/**
 * Label stock for Print Barcodes. Sizes are in millimetres so the sheet
 * prints true to size on any printer.
 *
 * Two kinds of stock:
 *  - roll: thermal / thermal-transfer label printers (TSC TE244 / TTP-244,
 *    Zebra ZD220 / GK420, Xprinter XP-350B / 365B / 420B, TVS LP 46,
 *    Honeywell, Argox…). The roll carries 1, 2 or 3 labels across; the
 *    printer treats each row as one "page", so every row is printed as its
 *    own page of exactly (roll width × label height).
 *  - a4: laser / inkjet label sheets (the common 65 / 40 / 24 / 21-up
 *    layouts), printed as A4 pages with the sheet's own margins.
 */

export type Stock = "roll" | "a4";

export interface LabelLayout {
  stock: Stock;
  cols: number;
  /** One label, mm. */
  w: number;
  h: number;
  /** Space between labels, mm. */
  gapX: number;
  gapY: number;
  /** Roll: blank liner on each side. A4: the sheet's top / left margin. */
  marginX: number;
  marginY: number;
  /** Printer alignment nudge, mm (+ right / down). */
  offsetX: number;
  offsetY: number;
}

export interface LayoutPreset { id: string; name: string; hint: string; layout: Omit<LabelLayout, "offsetX" | "offsetY"> }

export const PRESETS: LayoutPreset[] = [
  { id: "roll-1-50x25", name: "Roll · 1 across · 50 × 25 mm", hint: "Most common single-row label printers", layout: { stock: "roll", cols: 1, w: 50, h: 25, gapX: 0, gapY: 3, marginX: 0, marginY: 0 } },
  { id: "roll-1-38x25", name: "Roll · 1 across · 38 × 25 mm", hint: "Small single-row labels", layout: { stock: "roll", cols: 1, w: 38, h: 25, gapX: 0, gapY: 3, marginX: 0, marginY: 0 } },
  { id: "roll-1-100x50", name: "Roll · 1 across · 100 × 50 mm", hint: "Big labels / 4-inch printers", layout: { stock: "roll", cols: 1, w: 100, h: 50, gapX: 0, gapY: 3, marginX: 0, marginY: 0 } },
  { id: "roll-2-38x25", name: "Roll · 2 across · 38 × 25 mm", hint: "2-up retail labels (≈ 80 mm roll)", layout: { stock: "roll", cols: 2, w: 38, h: 25, gapX: 2, gapY: 3, marginX: 1, marginY: 0 } },
  { id: "roll-2-50x25", name: "Roll · 2 across · 50 × 25 mm", hint: "2-up labels (≈ 104 mm roll)", layout: { stock: "roll", cols: 2, w: 50, h: 25, gapX: 2, gapY: 3, marginX: 1, marginY: 0 } },
  { id: "roll-3-32x25", name: "Roll · 3 across · 32 × 25 mm", hint: "3-up retail labels (≈ 104 mm roll)", layout: { stock: "roll", cols: 3, w: 32, h: 25, gapX: 2, gapY: 3, marginX: 1, marginY: 0 } },
  { id: "roll-3-33x15", name: "Roll · 3 across · 33 × 15 mm", hint: "Small 3-up (jewellery, cosmetics)", layout: { stock: "roll", cols: 3, w: 33, h: 15, gapX: 2, gapY: 2, marginX: 1, marginY: 0 } },
  { id: "a4-65", name: "A4 sheet · 65 labels (5 × 13)", hint: "38.1 × 21.2 mm", layout: { stock: "a4", cols: 5, w: 38.1, h: 21.2, gapX: 2.5, gapY: 0, marginX: 4.7, marginY: 10.7 } },
  { id: "a4-40", name: "A4 sheet · 40 labels (4 × 10)", hint: "48.5 × 25.4 mm", layout: { stock: "a4", cols: 4, w: 48.5, h: 25.4, gapX: 0, gapY: 0, marginX: 8, marginY: 21.5 } },
  { id: "a4-24", name: "A4 sheet · 24 labels (3 × 8)", hint: "64 × 33.9 mm", layout: { stock: "a4", cols: 3, w: 64, h: 33.9, gapX: 2.5, gapY: 0, marginX: 7.2, marginY: 12.9 } },
  { id: "a4-21", name: "A4 sheet · 21 labels (3 × 7)", hint: "63.5 × 38.1 mm", layout: { stock: "a4", cols: 3, w: 63.5, h: 38.1, gapX: 2.5, gapY: 0, marginX: 7.2, marginY: 15.1 } },
];

export const DEFAULT_PRESET = PRESETS[0];

export function presetLayout(id: string): LabelLayout {
  const p = PRESETS.find((x) => x.id === id) ?? DEFAULT_PRESET;
  return { ...p.layout, offsetX: 0, offsetY: 0 };
}

/** Width of the printed page (roll: the whole roll; A4: 210 mm). */
export const pageWidth = (l: LabelLayout) => (l.stock === "a4" ? 210 : l.marginX * 2 + l.cols * l.w + (l.cols - 1) * l.gapX);

/** Rows that fit on one printed page. Roll: one row per page. */
export function rowsPerPage(l: LabelLayout) {
  if (l.stock === "roll") return 1;
  return Math.max(1, Math.floor((297 - l.marginY * 2 + l.gapY) / (l.h + l.gapY)));
}

/** Keeps typed values sane. */
export function cleanLayout(l: LabelLayout): LabelLayout {
  const n = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
  return {
    stock: l.stock === "a4" ? "a4" : "roll",
    cols: Math.round(n(l.cols, 1, 8)),
    w: n(l.w, 15, 200), h: n(l.h, 10, 150),
    gapX: n(l.gapX, 0, 20), gapY: n(l.gapY, 0, 20),
    marginX: n(l.marginX, 0, 30), marginY: n(l.marginY, 0, 40),
    offsetX: n(l.offsetX, -10, 10), offsetY: n(l.offsetY, -10, 10),
  };
}
