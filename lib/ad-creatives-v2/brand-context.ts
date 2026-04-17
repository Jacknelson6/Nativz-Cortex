// ---------------------------------------------------------------------------
// Ad Creatives v2 — Brand Render Context
// ---------------------------------------------------------------------------
//
// Assembles a BrandRenderContext for a client at render time by pulling:
//   - clients.name
//   - Brand DNA palette (from lib/knowledge/brand-context via v1 for now)
//   - Logo files from Supabase Storage (brand-logos bucket, pre-existing)
//   - brand_fonts registration
//
// This is a best-effort port; it intentionally reuses v1's brand DNA layer
// for palette + logo URLs so v2 doesn't require re-modeling brands in the
// DB. When v2 grows its own brand-dna tables, swap the inputs here.

import { createAdminClient } from "@/lib/supabase/admin";
import { registerClientBrandFonts, registerPackagedFonts } from "./fonts";
import type { BrandPalette, BrandRenderContext } from "./types";

/**
 * Build a BrandRenderContext by reading clients + v2 tables. Palette falls
 * back to a sensible neutral if the client's brand DNA is missing.
 */
export async function buildBrandContext(
  clientId: string,
): Promise<BrandRenderContext> {
  registerPackagedFonts();

  const admin = createAdminClient();

  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();
  if (clientError || !client) {
    throw new Error(
      `Client ${clientId} not found: ${clientError?.message ?? "no data"}`,
    );
  }

  await registerClientBrandFonts(clientId);

  const palette = await loadPalette(clientId);
  const logos = await loadLogos(clientId);
  const fonts = await listFonts(clientId);

  return {
    clientId,
    clientName: (client.name as string) ?? "(unknown)",
    palette,
    logos,
    fonts,
  };
}

// ---------------------------------------------------------------------------
// Palette — pulls from brand_dna / brand_dna_palette if they exist, else
// returns neutral.
// ---------------------------------------------------------------------------
async function loadPalette(clientId: string): Promise<BrandPalette> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("brand_dna")
    .select("colors")
    .eq("client_id", clientId)
    .maybeSingle();

  const raw = (data?.colors ?? []) as Array<{
    role?: string;
    hex?: string;
    name?: string;
  }>;
  const byRole = (role: string): string | undefined =>
    raw.find((c) => c.role === role)?.hex;

  const primary = byRole("primary") ?? "#0B1E3F";
  const accent = byRole("accent") ?? "#C9A24A";
  const ivory = byRole("neutral") ?? byRole("ivory") ?? "#F5F1E8";
  const charcoal = byRole("text") ?? byRole("charcoal") ?? "#1F2937";
  const muted = byRole("muted") ?? "#8A7B60";
  const onPrimary = byRole("on-primary") ?? "#FFFFFF";
  const onAccent = byRole("on-accent") ?? "#0B1E3F";

  const palette: BrandPalette = {
    primary,
    accent,
    onPrimary,
    onAccent,
    ivory,
    charcoal,
    muted,
  };

  // Pass-through any additional named roles (white, burgundy, red, warmGrey,
  // etc.) so brand-specific layouts can reference them directly.
  for (const entry of raw) {
    if (entry.role && entry.hex && !(entry.role in palette)) {
      palette[entry.role] = entry.hex;
    }
  }

  return palette;
}

// ---------------------------------------------------------------------------
// Logos — fetches PNG buffers from the existing `brand-logos` bucket
// (v1 pattern). Expects objects keyed by `<client_id>/<colorway>.png`.
//
// Temporary compatibility: we also check brand_dna.logos (JSON array) for
// URLs and colorway hints.
// ---------------------------------------------------------------------------
async function loadLogos(clientId: string): Promise<Record<string, Buffer>> {
  const admin = createAdminClient();
  const logos: Record<string, Buffer> = {};

  // First: brand_dna.logos (if populated with { colorway, storage_path })
  const { data: brandDna } = await admin
    .from("brand_dna")
    .select("logos")
    .eq("client_id", clientId)
    .maybeSingle();

  const dnaLogos = (brandDna?.logos ?? []) as Array<{
    colorway?: string;
    storage_path?: string;
    bucket?: string;
  }>;

  for (const entry of dnaLogos) {
    if (!entry.storage_path || !entry.colorway) continue;
    const bucket = entry.bucket ?? "brand-logos";
    const { data: blob } = await admin.storage
      .from(bucket)
      .download(entry.storage_path);
    if (blob) {
      logos[entry.colorway] = Buffer.from(await blob.arrayBuffer());
    }
  }

  return logos;
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------
async function listFonts(
  clientId: string,
): Promise<BrandRenderContext["fonts"]> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("brand_fonts")
    .select("family_alias, weight, italic")
    .eq("client_id", clientId);
  return (
    rows?.map((r) => ({
      family: r.family_alias as string,
      weight: r.weight as BrandRenderContext["fonts"][number]["weight"],
      italic: r.italic as boolean,
    })) ?? []
  );
}
