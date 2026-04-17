import { type SKRSContext2D } from "@napi-rs/canvas";
import { montFont, playfairFont } from "../../fonts";
import type { BrandRenderContext, ConceptSpec } from "../../types";
import {
  CANVAS_1080,
  drawLogoAt,
  fillSolid,
  loadImageFromBuffer,
  wrapAndDrawBody,
  drawLetterSpaced,
} from "../utils";
import { drawStarRow } from "../shape-helpers";
import { getHex } from "./ccc-palette";

/**
 * ccc-testimonial-card
 *   Cream / ivory bg. Giant primary-color quote mark. Playfair italic
 *   pullquote. 5-star vector polygon row. Attribution in Montserrat caps.
 *   Product photo right. Logo bottom-left.
 */
export async function renderCCCTestimonialCard(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
): Promise<void> {
  if (!photo) throw new Error("ccc-testimonial-card requires a product photo");

  const bg = concept.background ?? "cream";
  const bgHex = getHex(brand, bg);
  const txtHex = getHex(brand, "charcoal");
  const accentHex = getHex(brand, "primary");
  fillSolid(ctx, bgHex, 0, 0, CANVAS_1080, CANVAS_1080);

  if (concept.eyebrow) {
    ctx.fillStyle = accentHex;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    drawLetterSpaced(ctx, concept.eyebrow.toUpperCase(), 72, 110, 4);
  }

  // Giant decorative quote mark
  ctx.fillStyle = accentHex;
  ctx.font = playfairFont(220, { weight: 900, italic: true });
  ctx.textBaseline = "alphabetic";
  ctx.fillText("\u201C", 72, 260);

  if (concept.testimonial) {
    ctx.fillStyle = txtHex;
    ctx.font = playfairFont(46, { weight: 700, italic: true });
    const endY = wrapAndDrawBody(ctx, concept.testimonial.quote, {
      x: 72,
      y: 320,
      maxWidth: 480,
      lineHeight: 58,
    });
    drawStarRow(ctx, 72, endY + 48, 5, 16, 8, accentHex);
    ctx.fillStyle = txtHex;
    ctx.font = montFont(20, { weight: 700 });
    drawLetterSpaced(ctx, concept.testimonial.author.toUpperCase(), 72, endY + 100, 3);
  }

  // Product photo right
  const img = await loadImageFromBuffer(photo);
  const photoSize = 420;
  const px = CANVAS_1080 - photoSize - 40;
  const py = (CANVAS_1080 - photoSize) / 2;
  drawContainToRect(ctx, img, px, py, photoSize, photoSize);

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
