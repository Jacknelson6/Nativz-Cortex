import { type SKRSContext2D } from "@napi-rs/canvas";
import { archivoBlackFont, montFont } from "../../fonts";
import type { BrandRenderContext, ConceptSpec } from "../../types";
import {
  CANVAS_1080,
  drawCover,
  drawLetterSpaced,
  drawLogoAt,
  loadImageFromBuffer,
  wrapAndDrawBody,
} from "../utils";
import { drawCheckmark } from "../shape-helpers";
import { getHex } from "./ccc-palette";

/**
 * ccc-scene-stat-overlay
 *   Full-bleed Gemini scene. Semi-opaque primary-color slab on left 55%.
 *   Massive Archivo Black stat + Montserrat subhead + pillar checklist
 *   over the slab. Scene visible through the right 45%. Logo bottom-left.
 */
export async function renderCCCSceneStatOverlay(
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
): Promise<void> {
  if (!photo) throw new Error("ccc-scene-stat-overlay requires a scene photo");

  const img = await loadImageFromBuffer(photo);
  drawCover(ctx, img, 0, 0, CANVAS_1080, CANVAS_1080);

  const primary = getHex(brand, "primary");
  const creamHex = getHex(brand, "ivory");

  // Left-side primary-color slab (semi-opaque, bleeds slight scene color)
  const slabW = Math.round(CANVAS_1080 * 0.55);
  const { r, g, b } = hexToRgb(primary);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
  ctx.fillRect(0, 0, slabW, CANVAS_1080);

  // Gradient fade at the slab's right edge into the photo
  const fadeW = 80;
  const grad = ctx.createLinearGradient(slabW - fadeW, 0, slabW + fadeW, 0);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.95)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(slabW - fadeW, 0, fadeW * 2, CANVAS_1080);

  if (concept.eyebrow) {
    ctx.fillStyle = creamHex;
    ctx.font = montFont(22, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    drawLetterSpaced(ctx, concept.eyebrow.toUpperCase(), 72, 110, 4);
    ctx.fillStyle = creamHex;
    ctx.fillRect(72, 128, 80, 3);
  }

  // Massive stat
  const stat =
    typeof concept.headline === "string"
      ? concept.headline
      : concept.headline.map((s) => s.text).join(" ");
  ctx.fillStyle = creamHex;
  ctx.font = archivoBlackFont(220);
  ctx.textBaseline = "alphabetic";
  ctx.fillText(stat, 72, 380);

  if (concept.subhead) {
    ctx.fillStyle = creamHex;
    ctx.font = montFont(28, { weight: 700 });
    ctx.textBaseline = "alphabetic";
    wrapAndDrawBody(ctx, concept.subhead, {
      x: 72,
      y: 430,
      maxWidth: slabW - 144,
      lineHeight: 38,
    });
  }

  const pillars = concept.pillars ?? [];
  let py = 550;
  for (const p of pillars.slice(0, 4)) {
    drawCheckmark(ctx, 72, py - 20, 22, creamHex);
    ctx.fillStyle = creamHex;
    ctx.font = montFont(22, { weight: 700 });
    drawLetterSpaced(ctx, p.label.toUpperCase(), 108, py, 2);
    py += 46;
  }

  await drawLogoAt(ctx, brand, concept.logoColorway, {
    x: 72,
    y: CANVAS_1080 - 60,
    width: 200,
    anchor: "bottom-left",
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}
