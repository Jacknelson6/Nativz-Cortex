// ---------------------------------------------------------------------------
// Seed script — activate Ad Creatives v2 for Goldback
// ---------------------------------------------------------------------------
//
// Run after migration 110 is applied. Idempotent — safe to re-run.
//
// Goldback has real studio product photography (no Gemini scenes needed),
// so this seed activates the product-photo-first layouts. v2 scene library
// stays empty for this client.
//
// Layouts activated:
//   - goldback-headline-statement  (baseline — headline top, product center)
//   - goldback-stat-hero           (huge stat number + product photo)
//   - goldback-split-vertical      (half black + half product photo)
//
// Prerequisites:
//   - A clients row for Goldback exists
//   - brand_dna row populated with palette (gold + black) and logos
//   - Borax OTF files uploaded to Supabase Storage `brand-fonts` bucket
//     under <client_id>/borax-{weight}{-italic}.otf + brand_fonts rows
//     pointing to them (see scripts/upload-goldback-borax.ts when ready)
//
// Usage:
//   npx tsx scripts/seed-ad-creatives-v2-goldback.ts
//
// NOTE: The goldback-* layout renderers are NOT YET implemented in
// lib/ad-creatives-v2/layouts/renderers/. This script reserves the slugs;
// actual renderers need porting from morning-ads/scripts/src/layouts/
// before batches will succeed.

import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const admin = createClient(url, key);

  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("id, name")
    .or("slug.eq.goldback,name.ilike.%Goldback%")
    .limit(1)
    .maybeSingle();

  if (clientError || !client) {
    console.error(
      `[seed] Goldback client not found. Create a client row with slug 'goldback' or name like 'Goldback' first. ${clientError?.message ?? ""}`,
    );
    process.exit(1);
  }

  const clientId = client.id as string;
  console.log(`[seed] Goldback client resolved: ${client.name} (${clientId})`);

  const templates = [
    {
      client_id: clientId,
      layout_slug: "goldback-headline-statement",
      display_name: "Headline Statement — Studio Product",
      is_active: true,
    },
    {
      client_id: clientId,
      layout_slug: "goldback-stat-hero",
      display_name: "Stat Hero — Dominant Number",
      is_active: true,
    },
    {
      client_id: clientId,
      layout_slug: "goldback-split-vertical",
      display_name: "Split Vertical — Black + Product",
      is_active: true,
    },
  ];

  for (const t of templates) {
    const { error } = await admin
      .from("brand_ad_templates")
      .upsert(t, { onConflict: "client_id,layout_slug" });
    if (error) {
      console.error(`[seed]   ✗ ${t.layout_slug}: ${error.message}`);
    } else {
      console.log(`[seed]   ✓ ${t.layout_slug}`);
    }
  }

  // Sanity-check brand_dna has Borax fonts registered
  const { data: fontRows } = await admin
    .from("brand_fonts")
    .select("family_alias, weight, italic")
    .eq("client_id", clientId)
    .eq("family_alias", "Borax");
  const boraxCount = fontRows?.length ?? 0;
  if (boraxCount === 0) {
    console.warn(
      "[seed] ⚠ No Borax font rows found for Goldback. Upload Borax OTFs to the `brand-fonts` bucket and insert brand_fonts rows before rendering.",
    );
  } else {
    console.log(`[seed] Borax fonts registered: ${boraxCount} weight/style rows`);
  }

  console.log("[seed] done");
  console.log(
    "[seed] Next step: port goldback-* renderers from morning-ads/scripts/src/layouts/ into lib/ad-creatives-v2/layouts/renderers/ and register in registry.ts",
  );
}

main().catch((err) => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
