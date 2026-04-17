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
import { getHex } from "./ccc-palette";

/**
 * ccc-three-reasons
 *   Eyebrow + headline + red rule top-left. Big red numerals 1/2/3 with
 *   Montserrat-Bold reason text stacked left. Product photo top-right.
 *   Logo bottom-left.
 */
export async function renderCCCThreeReasons(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
): Promise<void> {
  if (!photo) throw new Error("ccc-three-reasons requires a product photo");

  const bg = concept.background ?? "cream";
  const bgHex = getHex(brand, bg);
  const txtHex = getHex(brand, bg === "charcoal" || bg === "burgundy" || bg === "red" ? "ivory" : "charcoal");
  const accentHex = getHex(brand, "primary");
  fillSolid(ctx, bgHex, 0, 0, CANVAS_1080, CANVAS_1080);

  if (concept.eyebrow) {
    ctx.fillStyle = accentHex;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    drawLetterSpaced(ctx, concept.eyebrow.toUpperCase(), 72, 90, 4);
  }

  const headline =
    typeof concept.headline === "string"
      ? concept.headline
      : concept.headline.map((s) => s.text).join(" ");
  ctx.fillStyle = txtHex;
  ctx.font = archivoBlackFont(72);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(headline.toUpperCase(), 72, 180);

  // Red rule under headline
  ctx.fillStyle = accentHex;
  ctx.fillRect(72, 208, 100, 6);

  // Product photo top-right
  const img = await loadImageFromBuffer(photo);
  drawContainToRect(ctx, img, CANVAS_1080 - 380, 260, 320, 320);

  const reasons = concept.reasons ?? [];
  let ry = 280;
  for (let i = 0; i < Math.min(3, reasons.length); i++) {
    ctx.fillStyle = accentHex;
    ctx.font = archivoBlackFont(96);
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(i + 1), 72, ry + 80);

    ctx.fillStyle = txtHex;
    ctx.font = montFont(28, { weight: 700 });
    wrapAndDrawBody(ctx, reasons[i], {
      x: 170,
      y: ry + 46,
      maxWidth: 440,
      lineHeight: 34,
    });
    ry += 130;
  }

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: 72,
    y: CANVAS_1080 - 70,
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
