// ---------------------------------------------------------------------------
// Ad Creatives v2 — Compose Orchestrator
// ---------------------------------------------------------------------------
//
// Entry point for rendering a single concept. Does:
//   1. Resolve the brand render context (palette, logos, fonts)
//   2. Fetch the photo buffer if the layout needs one
//   3. Dispatch to the layout renderer
//   4. Return PNG buffer + metadata

import { createCanvas } from "@napi-rs/canvas";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBrandContext } from "./brand-context";
import { getLayout } from "./layouts/registry";
import { CANVAS_1080, loadImageFromBuffer } from "./layouts/utils";
import { chromaKeyRemoveBg } from "./layouts/chroma-key";
import type { ConceptSpec, RenderResult } from "./types";

export async function composeV2(concept: ConceptSpec): Promise<RenderResult> {
  const brand = await buildBrandContext(concept.clientId);
  const layout = getLayout(concept.layoutSlug);

  let photo: Buffer | undefined;
  if (layout.needsPhoto) {
    if (!concept.photoStoragePath) {
      throw new Error(
        `Layout ${concept.layoutSlug} needs a photo, but photoStoragePath is missing`,
      );
    }
    photo = await fetchPhotoBuffer(concept.photoSource, concept.photoStoragePath);

    // Strip white studio background when requested, or when a CCC layout is
    // about to drop a product shot on a non-white brand color. Keeps brand
    // fidelity without a remove.bg API round-trip.
    const nonWhiteBg =
      typeof concept.background === "string" &&
      concept.background !== "white" &&
      concept.background !== "ivory";
    const isCCC = concept.layoutSlug.startsWith("ccc-");
    const shouldStrip =
      concept.stripWhiteBg === true || (isCCC && nonWhiteBg && concept.stripWhiteBg !== false);
    if (shouldStrip) {
      photo = await stripWhiteBgToPngBuffer(photo);
    }
  }

  const canvas = createCanvas(CANVAS_1080, CANVAS_1080);
  const ctx = canvas.getContext("2d");

  await layout.renderer(ctx, concept, brand, photo);

  const pngBuffer = canvas.toBuffer("image/png");
  return {
    pngBuffer,
    width: CANVAS_1080,
    height: CANVAS_1080,
    layoutSlug: concept.layoutSlug,
    renderedAt: new Date().toISOString(),
  };
}

async function stripWhiteBgToPngBuffer(buf: Buffer): Promise<Buffer> {
  const img = await loadImageFromBuffer(buf);
  const canvas = chromaKeyRemoveBg(img);
  return canvas.toBuffer("image/png");
}

async function fetchPhotoBuffer(
  source: ConceptSpec["photoSource"],
  storagePath: string,
): Promise<Buffer> {
  const admin = createAdminClient();
  const bucket =
    source === "product"
      ? "ad-creatives"
      : source === "scene"
        ? "brand-scene-photos"
        : "ad-creatives";
  const { data, error } = await admin.storage.from(bucket).download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to fetch photo ${storagePath}: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}
