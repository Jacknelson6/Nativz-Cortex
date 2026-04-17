import { type SKRSContext2D } from "@napi-rs/canvas";
import { montFont, playfairFont } from "../../fonts";
import type { BrandRenderContext, ConceptSpec } from "../../types";
import {
  CANVAS_1080,
  buildWords,
  drawGoldRule,
  drawHeadlineLines,
  drawLetterSpaced,
  drawLogoAt,
  fillSolid,
  wrapAndDrawBody,
  wrapWords,
} from "../utils";

/**
 * weston-navy-editorial
 *   Solid navy bg. Gold eyebrow + rule. Playfair serif headline.
 *   Montserrat subhead. Logo bottom-center.
 */
export async function renderWestonNavyEditorial(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
): Promise<void> {
  const bgHex =
    concept.background === "ivory"
      ? (brand.palette.ivory ?? brand.palette.onPrimary)
      : brand.palette.primary;
  fillSolid(ctx, bgHex, 0, 0, CANVAS_1080, CANVAS_1080);

  const defaultColor: keyof typeof brand.palette =
    concept.background === "ivory" ? "primary" : "onPrimary";

  if (concept.eyebrow) {
    ctx.fillStyle = brand.palette.accent;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    drawLetterSpaced(ctx, concept.eyebrow.toUpperCase(), 80, 120, 4);
  }
  drawGoldRule(ctx, 80, 140, 120, brand.palette.accent);

  const words = buildWords(concept.headline);
  const fontSize = 112;
  const maxWidth = CANVAS_1080 - 160;
  const lines = wrapWords(ctx, words, {
    font: playfairFont(fontSize, { weight: 700 }),
    maxWidth,
  });
  drawHeadlineLines(ctx, lines, {
    x: 80,
    yTop: 200,
    fontBuilder: (italic) => playfairFont(fontSize, { weight: 700, italic }),
    lineHeight: 1.05,
    fontSize,
    palette: brand.palette,
    defaultColor,
    align: "left",
    canvasWidth: CANVAS_1080,
  });

  if (concept.subhead) {
    const blockH = lines.length * fontSize * 1.05;
    const subY = 200 + blockH + 40;
    const subColor =
      concept.background === "ivory"
        ? (brand.palette.charcoal ?? brand.palette.primary)
        : (brand.palette.ivory ?? brand.palette.onPrimary);
    ctx.fillStyle = subColor!;
    ctx.font = montFont(28, { weight: 500 });
    ctx.textBaseline = "alphabetic";
    wrapAndDrawBody(ctx, concept.subhead, {
      x: 80,
      y: subY,
      maxWidth: CANVAS_1080 - 320,
      lineHeight: 40,
    });
  }

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: CANVAS_1080 / 2,
    y: CANVAS_1080 - 80,
    width: 340,
    anchor: "bottom-center",
  });
}
