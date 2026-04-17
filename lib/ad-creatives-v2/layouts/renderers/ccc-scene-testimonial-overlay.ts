import { type SKRSContext2D } from "@napi-rs/canvas";
import { montFont, playfairFont } from "../../fonts";
import type { BrandRenderContext, ConceptSpec } from "../../types";
import {
  CANVAS_1080,
  drawCover,
  drawLetterSpaced,
  drawLogoAt,
  loadImageFromBuffer,
  measureLetterSpaced,
} from "../utils";
import { drawStarRow } from "../shape-helpers";
import { getHex } from "./ccc-palette";

/**
 * ccc-scene-testimonial-overlay
 *   Full-bleed Gemini scene. Heavy centered charcoal vignette for text
 *   legibility. Giant primary-color quote mark. Playfair italic quote,
 *   vector 5-star row, Montserrat attribution. Logo bottom-center.
 */
export async function renderCCCSceneTestimonialOverlay(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
): Promise<void> {
  if (!photo) throw new Error("ccc-scene-testimonial-overlay requires a scene photo");

  const img = await loadImageFromBuffer(photo);
  drawCover(ctx, img, 0, 0, CANVAS_1080, CANVAS_1080);

  // Strong centered vignette
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_1080);
  grad.addColorStop(0, "rgba(31, 31, 31, 0.72)");
  grad.addColorStop(0.5, "rgba(31, 31, 31, 0.9)");
  grad.addColorStop(1, "rgba(31, 31, 31, 0.72)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_1080, CANVAS_1080);

  const primary = getHex(brand, "primary");
  const creamHex = getHex(brand, "ivory");

  if (concept.eyebrow) {
    ctx.fillStyle = primary;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    const eyebrow = concept.eyebrow.toUpperCase();
    const w = measureLetterSpaced(ctx, eyebrow, 4);
    drawLetterSpaced(ctx, eyebrow, (CANVAS_1080 - w) / 2, 180, 4);
  }

  // Giant decorative primary quote mark
  ctx.fillStyle = primary;
  ctx.font = playfairFont(200, { weight: 700, italic: true });
  ctx.textBaseline = "alphabetic";
  const qMark = "\u201C";
  const qw = ctx.measureText(qMark).width;
  ctx.fillText(qMark, (CANVAS_1080 - qw) / 2, 330);

  if (concept.testimonial) {
    // Quote (centered, Playfair italic)
    ctx.fillStyle = creamHex;
    ctx.font = playfairFont(46, { weight: 700, italic: true });
    ctx.textBaseline = "alphabetic";
    const quoteLines = wrapTextToLines(ctx, concept.testimonial.quote, CANVAS_1080 - 240);
    let qy = 420;
    for (const line of quoteLines) {
      const w = ctx.measureText(line).width;
      ctx.fillText(line, (CANVAS_1080 - w) / 2, qy);
      qy += 60;
    }

    // Star row
    const starR = 18;
    const starGap = 10;
    const starRowW = 5 * starR * 2 + 4 * starGap;
    drawStarRow(ctx, (CANVAS_1080 - starRowW) / 2, qy + 40, 5, starR, starGap, primary);

    // Attribution
    ctx.fillStyle = creamHex;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    const attr = concept.testimonial.author.toUpperCase();
    const attrW = measureLetterSpaced(ctx, attr, 3);
    drawLetterSpaced(ctx, attr, (CANVAS_1080 - attrW) / 2, qy + 100, 3);
  }

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: CANVAS_1080 / 2,
    y: CANVAS_1080 - 30,
    width: 200,
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
