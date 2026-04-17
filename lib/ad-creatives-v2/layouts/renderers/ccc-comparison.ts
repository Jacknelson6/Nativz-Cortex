import { type SKRSContext2D } from "@napi-rs/canvas";
import { archivoBlackFont, montFont } from "../../fonts";
import type { BrandRenderContext, ConceptSpec } from "../../types";
import {
  CANVAS_1080,
  drawLogoAt,
  fillSolid,
  loadImageFromBuffer,
  drawLetterSpaced,
  measureLetterSpaced,
} from "../utils";
import { drawCheckmark, drawXmark } from "../shape-helpers";
import { getHex } from "./ccc-palette";

/**
 * ccc-comparison
 *   Headline top. Product photo centered under headline. Two-column table:
 *   "Them" on left (muted ✗) vs "Us" on right (primary ✓). Rule separator.
 *   Logo bottom-center.
 */
export async function renderCCCComparison(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
): Promise<void> {
  if (!photo) throw new Error("ccc-comparison requires a product photo");

  const bg = concept.background ?? "cream";
  const bgHex = getHex(brand, bg);
  const txtHex = getHex(brand, bg === "charcoal" || bg === "burgundy" || bg === "red" ? "ivory" : "charcoal");
  const accentHex = getHex(brand, "primary");
  const mutedHex = getHex(brand, "muted");
  fillSolid(ctx, bgHex, 0, 0, CANVAS_1080, CANVAS_1080);

  if (concept.eyebrow) {
    ctx.fillStyle = accentHex;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    const eyebrow = concept.eyebrow.toUpperCase();
    const ebw = measureLetterSpaced(ctx, eyebrow, 4);
    drawLetterSpaced(ctx, eyebrow, (CANVAS_1080 - ebw) / 2, 70, 4);
  }

  const headline =
    typeof concept.headline === "string"
      ? concept.headline
      : concept.headline.map((s) => s.text).join(" ");
  ctx.fillStyle = txtHex;
  const headFont = 52;
  ctx.font = archivoBlackFont(headFont);
  ctx.textBaseline = "alphabetic";
  const upperH = headline.toUpperCase();
  const headMaxW = CANVAS_1080 - 120;
  const headLines =
    ctx.measureText(upperH).width <= headMaxW
      ? [upperH]
      : wrapTextToLines(ctx, upperH, headMaxW);
  let headY = 150;
  for (const line of headLines) {
    const w = ctx.measureText(line).width;
    ctx.fillText(line, (CANVAS_1080 - w) / 2, headY);
    headY += headFont * 1.05;
  }

  // Product photo small below headline
  const img = await loadImageFromBuffer(photo);
  drawContainToRect(ctx, img, (CANVAS_1080 - 200) / 2, headY, 200, 160);

  // Table
  const tableTop = Math.max(400, headY + 180);
  const colWidth = (CANVAS_1080 - 160) / 2;
  const leftX = 80;
  const rightX = 80 + colWidth;

  ctx.font = montFont(22, { weight: 700 });
  ctx.fillStyle = mutedHex;
  ctx.textBaseline = "alphabetic";
  const leftHead = "THEM";
  const leftHeadW = measureLetterSpaced(ctx, leftHead, 3);
  drawLetterSpaced(ctx, leftHead, leftX + (colWidth - leftHeadW) / 2, tableTop, 3);

  ctx.fillStyle = accentHex;
  const rightHead = "US";
  const rightHeadW = measureLetterSpaced(ctx, rightHead, 3);
  drawLetterSpaced(ctx, rightHead, rightX + (colWidth - rightHeadW) / 2, tableTop, 3);

  ctx.fillStyle = accentHex;
  ctx.fillRect(80, tableTop + 20, CANVAS_1080 - 160, 3);

  const rows = concept.comparison ?? [];
  let ry = tableTop + 56;
  const iconSize = 18;
  const iconGap = 10;
  for (const row of rows.slice(0, 5)) {
    ctx.font = montFont(20, { weight: 500 });
    ctx.textBaseline = "alphabetic";

    const leftTxtW = ctx.measureText(row.theirs).width;
    const leftTotal = iconSize + iconGap + leftTxtW;
    const leftStart = leftX + (colWidth - leftTotal) / 2;
    drawXmark(ctx, leftStart, ry - 16, iconSize, mutedHex);
    ctx.fillStyle = mutedHex;
    ctx.fillText(row.theirs, leftStart + iconSize + iconGap, ry);

    const rightTxtW = ctx.measureText(row.ours).width;
    const rightTotal = iconSize + iconGap + rightTxtW;
    const rightStart = rightX + (colWidth - rightTotal) / 2;
    drawCheckmark(ctx, rightStart, ry - 18, iconSize, accentHex);
    ctx.fillStyle = txtHex;
    ctx.fillText(row.ours, rightStart + iconSize + iconGap, ry);

    ry += 44;
  }

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: CANVAS_1080 / 2,
    y: CANVAS_1080 - 30,
    width: 220,
    anchor: "bottom-center",
  });
}

function drawContainToRect(
  ctx: SKRSContext2D,
  img: { width: number; height: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const srcRatio = img.width / img.height;
  const dstRatio = dw / dh;
  let renderW = dw;
  let renderH = dh;
  if (srcRatio > dstRatio) renderH = dw / srcRatio;
  else renderW = dh * srcRatio;
  const rx = dx + (dw - renderW) / 2;
  const ry = dy + (dh - renderH) / 2;
  ctx.drawImage(img as never, rx, ry, renderW, renderH);
}

function wrapTextToLines(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
