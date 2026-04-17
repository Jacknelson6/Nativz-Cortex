import { type SKRSContext2D } from "@napi-rs/canvas";
import { montFont, playfairFont } from "../../fonts.js";
import type { BrandRenderContext, ConceptSpec } from "../../types.js";
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
} from "../utils.js";

/**
 * weston-stat-hero
 *   Solid navy (or ivory). Massive gold stat number. Small Montserrat
 *   subhead with breathing room. Logo bottom-left.
 */
export async function renderWestonStatHero(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
): Promise<void> {
  const bg =
    concept.background === "ivory"
      ? (brand.palette.ivory ?? brand.palette.onPrimary)
      : brand.palette.primary;
  fillSolid(ctx, bg, 0, 0, CANVAS_1080, CANVAS_1080);
  const isNavyBg = concept.background !== "ivory";

  if (concept.eyebrow) {
    ctx.fillStyle = brand.palette.accent;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    drawLetterSpaced(ctx, concept.eyebrow.toUpperCase(), 80, 130, 4);
    drawGoldRule(ctx, 80, 150, 100, brand.palette.accent);
  }

  const words = buildWords(concept.headline);
  const fontSize = 200;
  const lineHeightCoef = 1.02;
  const lines = wrapWords(ctx, words, {
    font: playfairFont(fontSize, { weight: 900 }),
    maxWidth: CANVAS_1080 - 160,
  });
  drawHeadlineLines(ctx, lines, {
    x: 80,
    yTop: 230,
    fontBuilder: (italic) => playfairFont(fontSize, { weight: 900, italic }),
    lineHeight: lineHeightCoef,
    fontSize,
    palette: brand.palette,
    defaultColor: "accent",
    align: "left",
    canvasWidth: CANVAS_1080,
  });

  if (concept.subhead) {
    const blockH = lines.length * fontSize * lineHeightCoef;
    const subY = 230 + blockH + 80;
    const subColor = isNavyBg
      ? (brand.palette.onPrimary ?? brand.palette.ivory)
      : (brand.palette.charcoal ?? brand.palette.primary);
    ctx.fillStyle = subColor!;
    ctx.font = montFont(30, { weight: 500 });
    ctx.textBaseline = "alphabetic";
    wrapAndDrawBody(ctx, concept.subhead, {
      x: 80,
      y: subY,
      maxWidth: CANVAS_1080 - 200,
      lineHeight: 42,
    });
  }

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: 80,
    y: CANVAS_1080 - 72,
    width: 280,
    anchor: "bottom-left",
  });
}
