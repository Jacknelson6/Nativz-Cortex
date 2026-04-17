import { type SKRSContext2D } from "@napi-rs/canvas";
import { archivoBlackFont, montFont } from "../../fonts";
import type { BrandRenderContext, ConceptSpec } from "../../types";
import {
  CANVAS_1080,
  drawCover,
  drawLetterSpaced,
  drawLogoAt,
  loadImageFromBuffer,
  measureLetterSpaced,
} from "../utils";
import { drawCheckmark } from "../shape-helpers";
import { getHex } from "./ccc-palette";

/**
 * ccc-scene-pillar-bottom
 *   Full-bleed Gemini scene. Dark-gradient band on bottom 40%. Eyebrow +
 *   headline + 2×2 pillar grid overlaid on gradient. Logo bottom-center.
 *   Top eyebrow has its own small dark chip for legibility over any scene.
 */
export async function renderCCCScenePillarBottom(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
): Promise<void> {
  if (!photo) throw new Error("ccc-scene-pillar-bottom requires a scene photo");

  const img = await loadImageFromBuffer(photo);
  drawCover(ctx, img, 0, 0, CANVAS_1080, CANVAS_1080);

  // Dark charcoal gradient bottom-half for legibility
  const grad = ctx.createLinearGradient(0, CANVAS_1080 * 0.4, 0, CANVAS_1080);
  grad.addColorStop(0, "rgba(31, 31, 31, 0)");
  grad.addColorStop(0.35, "rgba(31, 31, 31, 0.7)");
  grad.addColorStop(1, "rgba(31, 31, 31, 0.95)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_1080, CANVAS_1080);

  // Top eyebrow chip
  if (concept.eyebrow) {
    const topGrad = ctx.createLinearGradient(0, 0, 0, 160);
    topGrad.addColorStop(0, "rgba(31, 31, 31, 0.55)");
    topGrad.addColorStop(1, "rgba(31, 31, 31, 0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, CANVAS_1080, 160);

    ctx.fillStyle = getHex(brand, "primary");
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    const eyebrow = concept.eyebrow.toUpperCase();
    const w = measureLetterSpaced(ctx, eyebrow, 4);
    drawLetterSpaced(ctx, eyebrow, (CANVAS_1080 - w) / 2, 80, 4);
  }

  // Headline (centered, just above the pillar grid)
  const headlineStr =
    typeof concept.headline === "string"
      ? concept.headline
      : concept.headline.map((s) => s.text).join(" ");
  const creamHex = getHex(brand, "ivory");
  ctx.fillStyle = creamHex;
  const hFont = 60;
  ctx.font = archivoBlackFont(hFont);
  ctx.textBaseline = "alphabetic";
  const upper = headlineStr.toUpperCase();
  const hMax = CANVAS_1080 - 120;
  const lines = ctx.measureText(upper).width <= hMax
    ? [upper]
    : wrapTextToLines(ctx, upper, hMax);
  let y = 620;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    ctx.fillText(line, (CANVAS_1080 - w) / 2, y);
    y += hFont * 1.05;
  }

  // 2x2 pillar grid
  const pillars = concept.pillars ?? [];
  const pillarTop = 770;
  const cellW = (CANVAS_1080 - 144) / 2;
  const cellH = 70;
  const accentHex = getHex(brand, "primary");
  for (let i = 0; i < Math.min(4, pillars.length); i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = 72 + col * cellW + cellW / 2;
    const cy = pillarTop + row * cellH;
    const checkSize = 18;
    const gap = 10;

    ctx.fillStyle = creamHex;
    ctx.font = montFont(20, { weight: 700 });
    const label = pillars[i].label.toUpperCase();
    const labelW = measureLetterSpaced(ctx, label, 3);
    const totalW = checkSize + gap + labelW;
    const startX = cx - totalW / 2;

    drawCheckmark(ctx, startX, cy - 2, checkSize, accentHex);
    ctx.fillStyle = creamHex;
    drawLetterSpaced(ctx, label, startX + checkSize + gap, cy + 16, 3);
  }

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: CANVAS_1080 / 2,
    y: CANVAS_1080 - 20,
    width: 180,
    anchor: "bottom-center",
  });
}

function wrapTextToLines(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
): string[] {
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
