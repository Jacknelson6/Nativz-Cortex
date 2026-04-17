import { type SKRSContext2D } from "@napi-rs/canvas";
import { archivoBlackFont, montFont } from "../../fonts";
import type { BrandRenderContext, ConceptSpec } from "../../types";
import {
  CANVAS_1080,
  drawLogoAt,
  fillSolid,
  loadImageFromBuffer,
  wrapAndDrawBody,
  drawLetterSpaced,
  measureLetterSpaced,
  drawCover,
  Word,
  buildWords,
  drawHeadlineLines,
  wrapWords,
} from "../utils";
import { drawCheckmark } from "../shape-helpers";
import { getHex } from "./ccc-palette";

/**
 * ccc-pillar-grid
 *   Product photo center. 2x2 pillar tiles below. Auto-wrapped headline top.
 *   Logo bottom-center. Info-density: headline + product + 4 pillar callouts + logo.
 */
export async function renderCCCPillarGrid(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
): Promise<void> {
  if (!photo) throw new Error("ccc-pillar-grid requires a product photo");

  const bg = concept.background ?? "cream";
  const bgHex = getHex(brand, bg, { fallback: "#E8DBB7" });
  const txtHex = getHex(brand, bg === "charcoal" || bg === "burgundy" || bg === "red" ? "onPrimary" : "charcoal", {
    fallback: bg === "charcoal" ? "#E8DBB7" : "#1F1F1F",
  });
  const accentHex = getHex(brand, "primary", { fallback: "#CE2C2C" });
  const mutedHex = getHex(brand, bg === "charcoal" || bg === "burgundy" || bg === "red" ? "ivory" : "muted", {
    fallback: "#8A7B60",
  });

  fillSolid(ctx, bgHex, 0, 0, CANVAS_1080, CANVAS_1080);

  // Eyebrow
  if (concept.eyebrow) {
    ctx.fillStyle = accentHex;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    const eyebrow = concept.eyebrow.toUpperCase();
    const ebw = measureLetterSpaced(ctx, eyebrow, 4);
    drawLetterSpaced(ctx, eyebrow, (CANVAS_1080 - ebw) / 2, 80, 4);
  }

  // Headline (Archivo Black UC, auto-wrap)
  const spans = typeof concept.headline === "string" ? [{ text: concept.headline }] : concept.headline;
  const rawLines: string[] = [];
  let current = "";
  for (const s of spans) {
    if (s.newline && current) {
      rawLines.push(current);
      current = "";
    }
    current = current ? `${current} ${s.text}` : s.text;
  }
  if (current) rawLines.push(current);
  const hFont = 64;
  const hMax = CANVAS_1080 - 120;
  ctx.font = archivoBlackFont(hFont);
  ctx.fillStyle = txtHex;
  ctx.textBaseline = "alphabetic";
  const wrapped: string[] = [];
  for (const line of rawLines) {
    const upper = line.toUpperCase();
    if (ctx.measureText(upper).width <= hMax) {
      wrapped.push(upper);
    } else {
      wrapped.push(...wrapTextToLines(ctx, upper, hMax));
    }
  }
  let y = 120;
  for (const line of wrapped) {
    const w = ctx.measureText(line).width;
    ctx.fillText(line, (CANVAS_1080 - w) / 2, y + hFont);
    y += hFont * 1.05;
  }

  // Product photo (cover-fit inside a framed zone)
  const img = await loadImageFromBuffer(photo);
  const photoTop = Math.max(280, y + 40);
  drawContainToRect(ctx, img, 120, photoTop, CANVAS_1080 - 240, 320);

  // Pillars (2x2 grid, snug above logo)
  const pillars = concept.pillars ?? [];
  const pillarTop = 690;
  const cellW = (CANVAS_1080 - 144) / 2;
  const cellH = 92;
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < Math.min(4, pillars.length); i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = 72 + col * cellW + cellW / 2;
    const cy = pillarTop + row * (cellH + 10);
    const checkSize = 20;
    const gap = 10;

    ctx.fillStyle = txtHex;
    ctx.font = montFont(22, { weight: 700 });
    const label = pillars[i].label.toUpperCase();
    const labelW = measureLetterSpaced(ctx, label, 3);
    const totalW = checkSize + gap + labelW;
    const startX = cx - totalW / 2;

    drawCheckmark(ctx, startX, cy + 2, checkSize, accentHex);
    ctx.fillStyle = txtHex;
    drawLetterSpaced(ctx, label, startX + checkSize + gap, cy + 20, 3);

    if (pillars[i].body) {
      ctx.fillStyle = mutedHex;
      ctx.font = montFont(18, { weight: 500 });
      wrapAndDrawBody(ctx, pillars[i].body!, {
        x: cx - (cellW - 40) / 2,
        y: cy + 52,
        maxWidth: cellW - 40,
        lineHeight: 24,
      });
    }
  }

  // Logo bottom-center (smaller so it doesn't crash pillars)
  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: CANVAS_1080 / 2,
    y: CANVAS_1080 - 20,
    width: 200,
    anchor: "bottom-center",
  });
}

/** Draw an image preserving aspect (contain-fit) into the given rect. */
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

/** Simple word-wrap returning lines that fit within maxWidth in the current ctx font. */
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
