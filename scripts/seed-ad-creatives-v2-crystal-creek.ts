// ---------------------------------------------------------------------------
// Seed script — activate Ad Creatives v2 for Crystal Creek Cattle
// ---------------------------------------------------------------------------
//
// Run AFTER migration 110 is applied. Idempotent — safe to re-run; uploads
// upsert and template rows use onConflict on (client_id, layout_slug).
//
// What this does:
//   1. Resolves the Crystal Creek client row
//   2. Uploads the red logo PNG to the `brand-logos` Supabase Storage bucket
//      at <client_id>/red-on-light.png
//   3. Generates a cream-tinted knockout PNG via @napi-rs/canvas pixel
//      recoloring and uploads it as <client_id>/cream-on-dark.png
//   4. Populates / upserts brand_dna with the CCC palette + logo refs
//   5. Uploads 3 representative product photos to the `ad-creatives` bucket
//      at <client_id>/ccc-products/<name>.jpg (so we have something to
//      render against without uploading the full 1.2GB library)
//   6. Registers all 6 CCC layouts in brand_ad_templates
//   7. Prints the storage paths so you can drop them straight into the
//      render preview form
//
// Usage:
//   CCC_SEED_LOGO=/path/to/crystal-creek-logotype.png \
//   CCC_SEED_PHOTOS_DIR=/path/to/Product\ Photos \
//   npx tsx scripts/seed-ad-creatives-v2-crystal-creek.ts
//
// Defaults for both env vars point at ~/Desktop/morning-ads so you can
// skip them if you kept the morning-ads layout.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MORNING_ADS_ROOT = join(homedir(), "Desktop", "morning-ads");

const DEFAULT_LOGO_PATH = join(
  MORNING_ADS_ROOT,
  "crystal-creek-cattle",
  "brand",
  "logos",
  "crystal-creek-logotype.png",
);
const DEFAULT_PHOTOS_DIR = join(homedir(), "Desktop", "Product Photos");

// Pick a few representative cuts so we have something to render immediately.
const SAMPLE_PHOTOS: Array<{
  srcRel: string;
  uploadName: string;
  label: string;
}> = [
  {
    srcRel: "Cowboy Ribeye/CowboyRibeye1Top.jpg",
    uploadName: "cowboy-ribeye-top.jpg",
    label: "Cowboy Ribeye — top",
  },
  {
    srcRel: "12 oz New York Strip/12ozNYStrip1Top.jpg",
    uploadName: "12oz-ny-strip-top.jpg",
    label: "12oz NY Strip — top",
  },
  {
    srcRel: "Prime Rib/PrimeRibTop.jpg",
    uploadName: "prime-rib-top.jpg",
    label: "Prime Rib — top",
  },
];

const TEMPLATES: Array<{ layout_slug: string; display_name: string }> = [
  { layout_slug: "ccc-pillar-grid", display_name: "Pillar Grid — 4 checkmark tiles + product hero" },
  { layout_slug: "ccc-stat-with-pillars", display_name: "Stat Hero — massive number + pillar checklist + product" },
  { layout_slug: "ccc-testimonial-card", display_name: "Testimonial Card — 5-star quote + attribution + product" },
  { layout_slug: "ccc-price-and-includes", display_name: "Price & Includes — hard price + what's included" },
  { layout_slug: "ccc-three-reasons", display_name: "Three Reasons — numbered carousel-ready list" },
  { layout_slug: "ccc-comparison", display_name: "Comparison — Them vs Us table with ✗/✓" },
];

const PALETTE = [
  { role: "primary", hex: "#CE2C2C", name: "Crystal Red" },
  { role: "accent", hex: "#7E1A1A", name: "Deep Burgundy" },
  { role: "charcoal", hex: "#1F1F1F", name: "Charcoal" },
  { role: "ivory", hex: "#E8DBB7", name: "Cream" },
  { role: "muted", hex: "#8A7B60", name: "Warm Grey" },
  { role: "on-primary", hex: "#E8DBB7", name: "Cream (text on red)" },
  { role: "on-accent", hex: "#E8DBB7", name: "Cream (text on burgundy)" },
  { role: "red", hex: "#CE2C2C", name: "Crystal Red (alias)" },
  { role: "cream", hex: "#E8DBB7", name: "Cream (alias)" },
  { role: "burgundy", hex: "#7E1A1A", name: "Burgundy (alias)" },
  { role: "white", hex: "#FFFFFF", name: "White" },
];

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const admin = createClient(url, key);

  // 1. Resolve Crystal Creek client
  const { data: client } = await admin
    .from("clients")
    .select("id, name, slug")
    .or(
      "slug.eq.crystal-creek-cattle,slug.eq.crystal-creek,name.ilike.%Crystal Creek%",
    )
    .limit(1)
    .maybeSingle();
  if (!client) {
    console.error(
      "[seed] Crystal Creek client not found. Create a client row with slug 'crystal-creek-cattle' first.",
    );
    process.exit(1);
  }
  const clientId = client.id as string;
  console.log(`[seed] Crystal Creek resolved: ${client.name} (${clientId})`);

  // 2. Resolve local logo file
  const logoPath = process.env.CCC_SEED_LOGO ?? DEFAULT_LOGO_PATH;
  if (!existsSync(logoPath)) {
    console.error(`[seed] Logo not found at ${logoPath}. Set CCC_SEED_LOGO env var.`);
    process.exit(1);
  }
  const logoRedBuf = readFileSync(logoPath);
  console.log(`[seed] loaded logo from ${logoPath} (${logoRedBuf.length} bytes)`);

  // 3. Upload red-on-light logo as-is
  const redStoragePath = `${clientId}/red-on-light.png`;
  await uploadOrReplace(admin, "brand-logos", redStoragePath, logoRedBuf, "image/png");
  console.log(`[seed]   ✓ brand-logos/${redStoragePath}`);

  // 4. Generate cream-tinted knockout for dark backgrounds + upload
  const creamBuf = await tintOpaquePixels(logoRedBuf, { r: 232, g: 219, b: 183 });
  const creamStoragePath = `${clientId}/cream-on-dark.png`;
  await uploadOrReplace(admin, "brand-logos", creamStoragePath, creamBuf, "image/png");
  console.log(`[seed]   ✓ brand-logos/${creamStoragePath}`);

  // 5. Upsert brand_dna
  const logosJson = [
    { colorway: "red-on-light", storage_path: redStoragePath, bucket: "brand-logos" },
    { colorway: "cream-on-dark", storage_path: creamStoragePath, bucket: "brand-logos" },
  ];
  const { data: existingDna } = await admin
    .from("brand_dna")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (existingDna?.id) {
    const { error: updErr } = await admin
      .from("brand_dna")
      .update({ colors: PALETTE, logos: logosJson })
      .eq("id", existingDna.id);
    if (updErr) console.error(`[seed] brand_dna update failed: ${updErr.message}`);
    else console.log(`[seed]   ✓ brand_dna updated (palette + ${logosJson.length} logos)`);
  } else {
    const { error: insErr } = await admin
      .from("brand_dna")
      .insert({ client_id: clientId, colors: PALETTE, logos: logosJson });
    if (insErr) console.error(`[seed] brand_dna insert failed: ${insErr.message}`);
    else console.log(`[seed]   ✓ brand_dna created (palette + ${logosJson.length} logos)`);
  }

  // 6. Upload sample product photos
  const photosDir = process.env.CCC_SEED_PHOTOS_DIR ?? DEFAULT_PHOTOS_DIR;
  const uploadedPhotos: Array<{ label: string; storagePath: string }> = [];
  for (const sample of SAMPLE_PHOTOS) {
    const src = join(photosDir, sample.srcRel);
    if (!existsSync(src)) {
      console.warn(`[seed] ⚠ photo missing at ${src} — skipping`);
      continue;
    }
    const buf = readFileSync(src);
    const storagePath = `${clientId}/ccc-products/${sample.uploadName}`;
    await uploadOrReplace(admin, "ad-creatives", storagePath, buf, "image/jpeg");
    uploadedPhotos.push({ label: sample.label, storagePath });
    console.log(`[seed]   ✓ ad-creatives/${storagePath} (${sample.label})`);
  }

  // 7. Register brand_ad_templates
  for (const t of TEMPLATES) {
    const { error } = await admin
      .from("brand_ad_templates")
      .upsert(
        { client_id: clientId, layout_slug: t.layout_slug, display_name: t.display_name, is_active: true },
        { onConflict: "client_id,layout_slug" },
      );
    if (error) console.error(`[seed]   ✗ ${t.layout_slug}: ${error.message}`);
    else console.log(`[seed]   ✓ ${t.layout_slug}`);
  }

  // 8. Print activation summary
  console.log("\n[seed] === Crystal Creek activated ===");
  console.log(`client_id: ${clientId}`);
  console.log("\nLayouts registered:");
  for (const t of TEMPLATES) console.log(`  ${t.layout_slug}`);
  console.log("\nLogo colorways:");
  console.log(`  red-on-light    → ${redStoragePath}`);
  console.log(`  cream-on-dark   → ${creamStoragePath}`);
  console.log("\nProduct photos (use in concept.photoStoragePath with photoSource='product'):");
  for (const p of uploadedPhotos) console.log(`  ${p.label} → ${p.storagePath}`);
  console.log("\nSample concept JSON for POST /api/ad-creatives-v2/render:");
  if (uploadedPhotos.length > 0) {
    console.log(
      JSON.stringify(
        {
          clientId,
          layoutSlug: "ccc-pillar-grid",
          aspect: "1:1",
          headline: "The Butcher Behind 240 Texas Steakhouses",
          eyebrow: "Premium pasture-raised beef",
          pillars: [
            { label: "Hand-Cut", body: "30+ years butchery" },
            { label: "Never Frozen", body: "Delivered daily fresh" },
            { label: "Naturally Raised", body: "No hormones, no antibiotics" },
            { label: "Restaurant-Grade", body: "Trusted by 240+ restaurants" },
          ],
          photoSource: "product",
          photoStoragePath: uploadedPhotos[0].storagePath,
          logoColorway: "red-on-light",
          background: "cream",
          stripWhiteBg: true,
        },
        null,
        2,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AdminClient = SupabaseClient;

async function uploadOrReplace(
  admin: AdminClient,
  bucket: string,
  path: string,
  buf: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, buf, { contentType, upsert: true });
  if (error) {
    throw new Error(`Upload to ${bucket}/${path} failed: ${error.message}`);
  }
}

/** Recolor every opaque pixel of a PNG to the target RGB, preserving alpha. */
async function tintOpaquePixels(
  pngBuffer: Buffer,
  target: { r: number; g: number; b: number },
): Promise<Buffer> {
  const img = await loadImage(pngBuffer);
  const canvas = createCanvas(img.width, img.height) as Canvas;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img as never, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0) {
      px[i] = target.r;
      px[i + 1] = target.g;
      px[i + 2] = target.b;
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toBuffer("image/png");
}

main().catch((err) => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
