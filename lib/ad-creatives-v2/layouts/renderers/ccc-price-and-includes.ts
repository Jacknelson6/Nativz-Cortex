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
import { drawCheckmark } from "../shape-helpers";
import { getHex } from "./ccc-palette";

/**
 * ccc-price-and-includes
 *   Product hero top, headline below, BIG red price, subhead, "what's
 *   included" bullet list with vector checkmarks, logo bottom-center.
 *   Price auto-shrinks if the string is long.
 */
export async function renderCCCPriceAndIncludes(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
): Promise<void> {
  if (!photo) throw new Error("ccc-price-and-includes requires a product photo");

  const bg = concept.background ?? "cream";
  const bgHex = getHex(brand, bg);
  const txtHex = getHex(brand, bg === "charcoal" || bg === "burgundy" || bg === "red" ? "ivory" : "charcoal");
  const accentHex = getHex(brand, "primary");
  fillSolid(ctx, bgHex, 0, 0, CANVAS_1080, CANVAS_1080);

  if (concept.eyebrow) {
    ctx.fillStyle = accentHex;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    const eyebrow = concept.eyebrow.toUpperCase();
    const ebw = measureLetterSpaced(ctx, eyebrow, 4);
    drawLetterSpaced(ctx, eyebrow, (CANVAS_1080 - ebw) / 2, 70, 4);
  }

  const img = await loadImageFromBuffer(photo);
  drawContainToRect(ctx, img, 60, 95, CANVAS_1080 - 120, 340);

  const headline =
    typeof concept.headline === "string"
      ? concept.headline
      : concept.headline.map((s) => s.text).join(" ");
  ctx.fillStyle = txtHex;
  ctx.font = archivoBlackFont(64);
  ctx.textBaseline = "alphabetic";
  const upperH = headline.toUpperCase();
  const hw = ctx.measureText(upperH).width;
  ctx.fillText(upperH, (CANVAS_1080 - hw) / 2, 490);

  if (concept.price) {
    ctx.fillStyle = accentHex;
    const maxPriceW = CANVAS_1080 - 160;
    let priceFont = 120;
    ctx.font = archivoBlackFont(priceFont);
    while (ctx.measureText(concept.price).width > maxPriceW && priceFont > 40) {
      priceFont -= 6;
      ctx.font = archivoBlackFont(priceFont);
    }
    ctx.textBaseline = "alphabetic";
    const pw = ctx.measureText(concept.price).width;
    ctx.fillText(concept.price, (CANVAS_1080 - pw) / 2, 610);
  }

  if (concept.subhead) {
    ctx.fillStyle = txtHex;
    ctx.font = montFont(26, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    const sub = concept.subhead.toUpperCase();
    const sw = measureLetterSpaced(ctx, sub, 3);
    drawLetterSpaced(ctx, sub, (CANVAS_1080 - sw) / 2, 660, 3);
  }

  if (concept.included && concept.included.length > 0) {
    let iy = 730;
    const checkSize = 20;
    const gap = 12;
    for (const item of concept.included.slice(0, 4)) {
      ctx.font = montFont(22, { weight: 500 });
      ctx.textBaseline = "alphabetic";
      const itemW = ctx.measureText(item).width;
      const totalW = checkSize + gap + itemW;
      const startX = (CANVAS_1080 - totalW) / 2;

      drawCheckmark(ctx, startX, iy - 18, checkSize, accentHex);
      ctx.fillStyle = txtHex;
      ctx.fillText(item, startX + checkSize + gap, iy);
      iy += 36;
    }
  }

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: CANVAS_1080 / 2,
    y: CANVAS_1080 - 30,
    width: 240,
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
