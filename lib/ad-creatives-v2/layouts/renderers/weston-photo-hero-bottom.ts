import { type SKRSContext2D } from "@napi-rs/canvas";
import { montFont, playfairFont } from "../../fonts";
import type { BrandRenderContext, ConceptSpec } from "../../types";
import {
  CANVAS_1080,
  applyNavyGradientBottom,
  buildWords,
  drawCover,
  drawGoldRule,
  drawHeadlineLines,
  drawLetterSpaced,
  drawLogoAt,
  loadImageFromBuffer,
  wrapWords,
} from "../utils";

/**
 * weston-photo-hero-bottom
 *   Full-bleed photo + strong navy gradient bottom half. Eyebrow + rule +
 *   headline sit on the gradient region where text is fully legible.
 *   Logo bottom-right.
 *
 * Requires concept.photoSource !== 'none' and the photo to be pre-fetched
 * as a Buffer by the orchestrator (passed via `photoBuffer` on the concept
 * stash — compose() handles this).
 */
export async function renderWestonPhotoHeroBottom(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photoBuffer: Buffer,
): Promise<void> {
  const img = await loadImageFromBuffer(photoBuffer);
  drawCover(ctx, img, 0, 0, CANVAS_1080, CANVAS_1080);

  applyNavyGradientBottom(ctx, CANVAS_1080, brand.palette.primary);

  if (concept.eyebrow) {
    ctx.fillStyle = brand.palette.accent;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    drawLetterSpaced(ctx, concept.eyebrow.toUpperCase(), 80, 620, 4);
    drawGoldRule(ctx, 80, 640, 100, brand.palette.accent);
  }

  const words = buildWords(concept.headline);
  const fontSize = 88;
  const lines = wrapWords(ctx, words, {
    font: playfairFont(fontSize, { weight: 700 }),
    maxWidth: CANVAS_1080 - 160,
  });
  drawHeadlineLines(ctx, lines, {
    x: 80,
    yTop: 680,
    fontBuilder: (italic) => playfairFont(fontSize, { weight: 700, italic }),
    lineHeight: 1.04,
    fontSize,
    palette: brand.palette,
    defaultColor: "onPrimary",
    align: "left",
    canvasWidth: CANVAS_1080,
  });

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: CANVAS_1080 - 72,
    y: CANVAS_1080 - 72,
    width: 240,
    anchor: "bottom-right",
  });
}
