// ---------------------------------------------------------------------------
// Ad Creatives v2 — Layout Registry
// ---------------------------------------------------------------------------
//
// Maps brand_ad_templates.layout_slug to a renderer function. Each renderer
// is a pure function of (ctx, concept, brand [, photo]) → void that draws
// onto the canvas.
//
// Adding a new layout:
//   1. Create a renderer file in layouts/renderers/<slug>.ts
//   2. Import + export it here
//   3. Add a row to brand_ad_templates for any client that should see it

import type { SKRSContext2D } from "@napi-rs/canvas";
import type { BrandRenderContext, ConceptSpec } from "../types";
import { renderWestonNavyEditorial } from "./renderers/weston-navy-editorial";
import { renderWestonStatHero } from "./renderers/weston-stat-hero";
import { renderWestonPhotoHeroBottom } from "./renderers/weston-photo-hero-bottom";
import { renderCCCPillarGrid } from "./renderers/ccc-pillar-grid";
import { renderCCCStatWithPillars } from "./renderers/ccc-stat-with-pillars";
import { renderCCCTestimonialCard } from "./renderers/ccc-testimonial-card";
import { renderCCCPriceAndIncludes } from "./renderers/ccc-price-and-includes";
import { renderCCCThreeReasons } from "./renderers/ccc-three-reasons";
import { renderCCCComparison } from "./renderers/ccc-comparison";
import { renderCCCScenePillarBottom } from "./renderers/ccc-scene-pillar-bottom";
import { renderCCCSceneStatOverlay } from "./renderers/ccc-scene-stat-overlay";
import { renderCCCSceneTestimonialOverlay } from "./renderers/ccc-scene-testimonial-overlay";

/** Renderer signature — photo is provided only when the layout needs it. */
export type LayoutRenderer = (
  ctx: SKRSContext2D,
  concept: ConceptSpec,
  brand: BrandRenderContext,
  photo?: Buffer,
) => Promise<void>;

/** Whether a layout slug requires a photo buffer at compose time. */
export type LayoutRequirements = {
  renderer: LayoutRenderer;
  needsPhoto: boolean;
};

/** Layout registry keyed by slug. */
const LAYOUTS: Record<string, LayoutRequirements> = {
  "weston-navy-editorial": {
    renderer: (ctx, concept, brand) =>
      renderWestonNavyEditorial(ctx, concept, brand),
    needsPhoto: false,
  },
  "weston-stat-hero": {
    renderer: (ctx, concept, brand) =>
      renderWestonStatHero(ctx, concept, brand),
    needsPhoto: false,
  },
  "weston-photo-hero-bottom": {
    renderer: (ctx, concept, brand, photo) => {
      if (!photo) {
        throw new Error(
          `Layout weston-photo-hero-bottom requires a photo buffer`,
        );
      }
      return renderWestonPhotoHeroBottom(ctx, concept, brand, photo);
    },
    needsPhoto: true,
  },
  // --- Crystal Creek Cattle info-dense layouts ---
  "ccc-pillar-grid": {
    renderer: (ctx, concept, brand, photo) => renderCCCPillarGrid(ctx, concept, brand, photo),
    needsPhoto: true,
  },
  "ccc-stat-with-pillars": {
    renderer: (ctx, concept, brand, photo) => renderCCCStatWithPillars(ctx, concept, brand, photo),
    needsPhoto: true,
  },
  "ccc-testimonial-card": {
    renderer: (ctx, concept, brand, photo) => renderCCCTestimonialCard(ctx, concept, brand, photo),
    needsPhoto: true,
  },
  "ccc-price-and-includes": {
    renderer: (ctx, concept, brand, photo) => renderCCCPriceAndIncludes(ctx, concept, brand, photo),
    needsPhoto: true,
  },
  "ccc-three-reasons": {
    renderer: (ctx, concept, brand, photo) => renderCCCThreeReasons(ctx, concept, brand, photo),
    needsPhoto: true,
  },
  "ccc-comparison": {
    renderer: (ctx, concept, brand, photo) => renderCCCComparison(ctx, concept, brand, photo),
    needsPhoto: true,
  },
  // --- CCC scene-based layouts (Gemini hero imagery + text/logo composited) ---
  "ccc-scene-pillar-bottom": {
    renderer: (ctx, concept, brand, photo) => renderCCCScenePillarBottom(ctx, concept, brand, photo),
    needsPhoto: true,
  },
  "ccc-scene-stat-overlay": {
    renderer: (ctx, concept, brand, photo) => renderCCCSceneStatOverlay(ctx, concept, brand, photo),
    needsPhoto: true,
  },
  "ccc-scene-testimonial-overlay": {
    renderer: (ctx, concept, brand, photo) =>
      renderCCCSceneTestimonialOverlay(ctx, concept, brand, photo),
    needsPhoto: true,
  },
};

export function getLayout(slug: string): LayoutRequirements {
  const layout = LAYOUTS[slug];
  if (!layout) {
    throw new Error(
      `Unknown layout slug "${slug}". Registered: ${Object.keys(LAYOUTS).join(", ")}`,
    );
  }
  return layout;
}

export function listLayouts(): string[] {
  return Object.keys(LAYOUTS);
}
