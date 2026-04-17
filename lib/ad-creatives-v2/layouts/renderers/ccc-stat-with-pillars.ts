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
} from "../utils";
import { drawCheckmark } from "../shape-helpers";
import { getHex } from "./ccc-palette";

/**
 * ccc-stat-with-pillars
 *   Solid red / charcoal bg. MASSIVE stat number (the headline) in cream.
 *   Subhead below. 4 pillar tick-list. Product photo small bottom-right.
 *   Logo bottom-left.
 */
export async function renderCCCStatWithPillars(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
): Promise<void> {
  if (!photo) throw new Error("ccc-stat-with-pillars requires a product photo");

  const bg = concept.background ?? "red";
  const bgHex = getHex(brand, bg);
  const textHex = getHex(brand, "ivory");
  fillSolid(ctx, bgHex, 0, 0, CANVAS_1080, CANVAS_1080);

  if (concept.eyebrow) {
    ctx.fillStyle = textHex;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    drawLetterSpaced(ctx, concept.eyebrow.toUpperCase(), 72, 110, 4);
    ctx.fillStyle = textHex;
    ctx.fillRect(72, 128, 100, 3);
  }

  const stat =
    typeof concept.headline === "string"
      ? concept.headline
      : concept.headline.map((s) => s.text).join(" ");
  ctx.fillStyle = textHex;
  ctx.font = archivoBlackFont(240);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(stat, 72, 410);

  if (concept.subhead) {
    ctx.fillStyle = textHex;
    ctx.font = montFont(30, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    wrapAndDrawBody(ctx, concept.subhead, {
      x: 72,
      y: 460,
      maxWidth: 640,
      lineHeight: 40,
    });
  }

  const pillars = concept.pillars ?? [];
  let py = 580;
  for (const p of pillars.slice(0, 4)) {
    drawCheckmark(ctx, 72, py - 22, 26, textHex);
    ctx.fillStyle = textHex;
    ctx.font = montFont(26, { weight: 700 });
    drawLetterSpaced(ctx, p.label.toUpperCase(), 110, py - 4, 2);
    py += 56;
  }

  // Product photo bottom-right
  const img = await loadImageFromBuffer(photo);
  const photoSize = 360;
  const px = CANVAS_1080 - photoSize - 40;
  const py2 = CANVAS_1080 - photoSize - 120;
  drawContainToRect(ctx, img, px, py2, photoSize, photoSize);

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: 72,
    y: CANVAS_1080 - 72,
    width: 220,
    anchor: "bottom-left",
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
